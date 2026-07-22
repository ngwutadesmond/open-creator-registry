import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';

import { createWikidataFixtureFetch } from '@open-creator-registry/ingestion/fixtures';
import { defaultConnectorContext } from '@open-creator-registry/ingestion/contracts';
import { createIngestionOrchestrator } from '@open-creator-registry/ingestion/orchestrator';
import { createDefaultConnectorRegistry } from '@open-creator-registry/ingestion/registry';
import { runScheduledIngestion } from '@open-creator-registry/ingestion/scheduled';
import { createExternalProfileRepository } from '../repositories/external-profile-repository';
import { createSourceCheckpointRepository } from '../repositories/source-checkpoint-repository';
import {
  createSourceConfigurationRepository,
  defaultWikidataSourceConfiguration,
} from '../repositories/source-configuration-repository';
import { createSourceLockRepository } from '../repositories/source-lock-repository';
import { clearDatabase, createTestCreator } from './test-utils';

beforeEach(clearDatabase);

const connectorContext = {
  ...defaultConnectorContext,
  fetch: createWikidataFixtureFetch(),
  now: () => new Date().toISOString(),
  sleep: () => Promise.resolve(),
  random: () => 0,
};

describe('external profile persistence', () => {
  it('validates profiles, detects global conflicts, and filters public visibility', async () => {
    const first = await createTestCreator({ canonicalName: 'Profile Creator One' });
    const second = await createTestCreator({ canonicalName: 'Profile Creator Two' });
    const repository = createExternalProfileRepository(env.DB);
    const created = await repository.create({
      creatorEntityId: first.id,
      platform: 'twitter',
      platformAccountId: 'stable-1',
      platformHandle: '@ProfileCreator',
      profileUrl: 'https://twitter.com/ProfileCreator',
      isPrimary: true,
      verificationStatus: 'source_linked',
      visibilityStatus: 'public',
      sourceName: 'integration_fixture',
      sourceReference: 'Q1',
      sourceLicense: 'CC0-1.0',
      confidenceScore: 90,
    });
    expect(created.platform).toBe('x');
    expect(await repository.listPublicByCreator(first.id)).toHaveLength(1);
    expect(
      await repository.checkConflicts({
        creatorEntityId: second.id,
        platform: 'x',
        platformAccountId: 'stable-1',
        verificationStatus: 'source_linked',
        visibilityStatus: 'private',
        sourceName: 'other_source',
        confidenceScore: 80,
      }),
    ).toContainEqual(
      expect.objectContaining({ type: 'stable_account', creatorEntityId: first.id }),
    );
    const replacementPrimary = await repository.create({
      creatorEntityId: first.id,
      platform: 'x',
      platformAccountId: 'stable-2',
      platformHandle: '@ProfileCreatorOfficial',
      profileUrl: 'https://x.com/ProfileCreatorOfficial',
      isPrimary: true,
      verificationStatus: 'cross_source_confirmed',
      visibilityStatus: 'public',
      sourceName: 'integration_fixture',
      sourceReference: 'Q1-secondary',
      sourceLicense: 'CC0-1.0',
      confidenceScore: 92,
    });
    expect(replacementPrimary.isPrimary).toBe(true);
    expect(await repository.findById(created.id)).toMatchObject({ isPrimary: false });
    await repository.updateVisibilityStatus(created.id, 'private');
    expect(await repository.listPublicByCreator(first.id)).toEqual([
      expect.objectContaining({ id: replacementPrimary.id, isPrimary: true }),
    ]);
  });
});

describe('bounded ingestion orchestration', () => {
  async function configure(dryRun = false) {
    return createSourceConfigurationRepository(env.DB).upsert({
      ...defaultWikidataSourceConfiguration,
      enabled: true,
      dryRun,
      minimumRequestIntervalMs: 0,
    });
  }

  it('is disabled by default', async () => {
    await createSourceConfigurationRepository(env.DB).upsert(defaultWikidataSourceConfiguration);
    const result = await createIngestionOrchestrator({
      db: env.DB,
      registry: createDefaultConnectorRegistry(),
      connectorContext,
    }).execute({ sourceName: 'wikidata' });
    expect(result).toMatchObject({ status: 'disabled', runId: null, fetchedCount: 0 });
  });

  it('creates candidates, stores provenance, advances checkpoints, and remains idempotent', async () => {
    await configure(false);
    const orchestrator = createIngestionOrchestrator({
      db: env.DB,
      registry: createDefaultConnectorRegistry(),
      connectorContext,
    });
    const first = await orchestrator.execute({ sourceName: 'wikidata' });
    const second = await orchestrator.execute({ sourceName: 'wikidata' });
    expect(first).toMatchObject({ status: 'completed', createdCount: 2, fetchedCount: 2 });
    expect(second).toMatchObject({ status: 'completed', duplicateCount: 2, createdCount: 0 });
    const candidates = await env.DB.prepare(
      'SELECT COUNT(*) AS count FROM creator_candidates',
    ).first<{
      count: number;
    }>();
    const provenance = await env.DB.prepare(
      'SELECT COUNT(*) AS count FROM candidate_source_provenance',
    ).first<{ count: number }>();
    expect(candidates?.count).toBe(2);
    expect(provenance?.count).toBe(2);
    expect(
      await createSourceCheckpointRepository(env.DB).findBySourceScope('wikidata', 'default'),
    ).toMatchObject({
      consecutiveFailureCount: 0,
      lastSourceRecordId: 'Q100002',
    });
    expect(
      await env.DB.prepare('SELECT COUNT(*) AS count FROM reserved_handles').first<{
        count: number;
      }>(),
    ).toEqual({ count: 0 });
    expect(
      await env.DB.prepare('SELECT COUNT(*) AS count FROM registry_releases').first<{
        count: number;
      }>(),
    ).toEqual({ count: 0 });
  });

  it('supports dry runs without creating candidates', async () => {
    await configure(true);
    const result = await createIngestionOrchestrator({
      db: env.DB,
      registry: createDefaultConnectorRegistry(),
      connectorContext,
    }).execute({ sourceName: 'wikidata', preview: true });
    expect(result).toMatchObject({ dryRun: true, createdCount: 0, skippedCount: 2 });
    expect(
      await env.DB.prepare('SELECT COUNT(*) AS count FROM creator_candidates').first<{
        count: number;
      }>(),
    ).toEqual({ count: 0 });
  });

  it('prevents overlap, recovers expired leases, and rejects ownership-mismatched release', async () => {
    await configure(false);
    const locks = createSourceLockRepository(env.DB);
    const active = await locks.acquire({
      sourceName: 'wikidata',
      scopeKey: 'default',
      runId: 'active-run',
      leaseOwner: 'owner-a',
      leaseDurationMs: 60_000,
    });
    expect(active).not.toBeNull();
    expect(await locks.release('wikidata', 'default', 'other-run', 'owner-b')).toBe(false);
    const result = await createIngestionOrchestrator({
      db: env.DB,
      registry: createDefaultConnectorRegistry(),
      connectorContext,
    }).execute({ sourceName: 'wikidata' });
    expect(result.status).toBe('locked');
    await env.DB.prepare(
      "UPDATE source_run_locks SET expires_at = '2000-01-01T00:00:00.000Z'",
    ).run();
    expect(
      await locks.acquire({
        sourceName: 'wikidata',
        scopeKey: 'default',
        runId: 'replacement-run',
        leaseOwner: 'owner-b',
        leaseDurationMs: 60_000,
      }),
    ).toMatchObject({ runId: 'replacement-run' });
  });

  it('runs only scheduled sources and isolates an unavailable connector', async () => {
    await createSourceConfigurationRepository(env.DB).upsert({
      ...defaultWikidataSourceConfiguration,
      enabled: true,
      scheduledEnabled: true,
      dryRun: false,
      minimumRequestIntervalMs: 0,
    });
    await createSourceConfigurationRepository(env.DB).upsert({
      ...defaultWikidataSourceConfiguration,
      sourceName: 'future_source',
      enabled: true,
      scheduledEnabled: true,
      connectorVersion: 'not_implemented',
      configurationStatus: 'valid',
    });
    const results = await runScheduledIngestion({
      db: env.DB,
      registry: createDefaultConnectorRegistry(),
      connectorContext,
    });
    expect(results).toEqual([
      expect.objectContaining({ sourceName: 'future_source', status: 'failed' }),
      expect.objectContaining({ sourceName: 'wikidata', status: 'completed', createdCount: 2 }),
    ]);
  });
});
