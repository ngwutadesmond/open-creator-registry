import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createCreatorAliasRepository } from '@open-creator-registry/database/repositories/creator-alias-repository';
import { createCreatorRepository } from '@open-creator-registry/database/repositories/creator-repository';
import { createRegistryReleaseRepository } from '@open-creator-registry/database/repositories/registry-release-repository';
import { createReservedHandleRepository } from '@open-creator-registry/database/repositories/reserved-handle-repository';
import { createDeterministicMetadataProvider } from '@open-creator-registry/database/runtime';

import { createPublicApp } from './routes';
import { batchHandleCheckResponseSchema, handleCheckResponseSchema } from './schemas';
import {
  deterministicRequestMetadata,
  requestApi,
  resetAndSeedApiDatabase,
  testBindings,
} from './test-utils';

beforeEach(resetAndSeedApiDatabase);

async function checkHandle(handle: string) {
  const response = await requestApi(`/api/v1/handles/check?handle=${encodeURIComponent(handle)}`);
  const body = handleCheckResponseSchema.parse(await response.json());
  expect(response.status).toBe(200);
  return body.data;
}

describe('public handle checking', () => {
  it('applies exact hard, soft, monitored, and not-listed classifications', async () => {
    await expect(checkHandle('@DEMO.AURORA-VALE')).resolves.toMatchObject({
      normalized_handle: 'demo_aurora_vale',
      registry_status: 'hard_reserved',
      recommended_action: 'deny_and_offer_claim',
      matched_by: 'exact_handle',
      claim_allowed: true,
      registration_may_continue: true,
    });
    await expect(checkHandle('real_demo_aurora_vale')).resolves.toMatchObject({
      registry_status: 'soft_protected',
      recommended_action: 'require_claim_or_review',
      matched_by: 'exact_handle',
    });
    await expect(checkHandle('demo_aurora_vale_fans')).resolves.toMatchObject({
      registry_status: 'monitored',
      recommended_action: 'allow_with_impersonation_monitoring',
      matched_by: 'exact_handle',
    });
    await expect(checkHandle('ordinary_unlisted_demo')).resolves.toMatchObject({
      registry_status: 'not_listed',
      recommended_action: 'perform_platform_availability_check',
      matched_by: 'none',
      claim_allowed: false,
      creator: null,
    });
  });

  it('matches verified official, protected-variant, and ordinary aliases', async () => {
    await expect(checkHandle('AminaBello Demo')).resolves.toMatchObject({
      registry_status: 'soft_protected',
      matched_by: 'official_handle_alias',
    });
    await expect(checkHandle('Alex Lee Demo Education')).resolves.toMatchObject({
      registry_status: 'soft_protected',
      matched_by: 'protected_variant',
    });
    await expect(checkHandle('FrameForge Demo')).resolves.toMatchObject({
      registry_status: 'soft_protected',
      matched_by: 'alias',
    });
  });

  it('treats a Cyrillic confusable as a risk signal rather than identity proof', async () => {
    const result = await checkHandle('dеmo_aurora_vale');
    expect(result).toMatchObject({
      registry_status: 'soft_protected',
      matched_by: 'confusable_skeleton',
      registration_may_continue: true,
    });
    expect(result.confidence_score).toBeLessThanOrEqual(90);
  });

  it('excludes released handles and conservatively protects suspended and disputed records', async () => {
    const repository = createReservedHandleRepository(env.DB);
    await repository.updateStatus('40000000-0000-4000-8000-000000000004', 'released');
    await repository.updateStatus('40000000-0000-4000-8000-000000000005', 'suspended');
    await repository.updateStatus('40000000-0000-4000-8000-000000000006', 'disputed');

    await expect(checkHandle('demo_frame_forge')).resolves.toMatchObject({
      registry_status: 'not_listed',
      reservation_status: null,
    });
    await expect(checkHandle('demo_nova_quest')).resolves.toMatchObject({
      registry_status: 'soft_protected',
      reservation_status: 'suspended',
    });
    await expect(checkHandle('demo_kofi_laughs')).resolves.toMatchObject({
      registry_status: 'soft_protected',
      reservation_status: 'disputed',
    });
  });

  it('suppresses creator attribution for conflicting identities while preserving precedence', async () => {
    const aliases = createCreatorAliasRepository(env.DB);
    await aliases.create({
      creatorEntityId: '10000000-0000-4000-8000-000000000002',
      alias: 'demo_aurora_vale',
      aliasType: 'known_alias',
      confidenceScore: 80,
      sourceId: '20000000-0000-4000-8000-000000000002',
    });
    const result = await checkHandle('demo_aurora_vale');
    expect(result).toMatchObject({
      registry_status: 'hard_reserved',
      matched_by: 'exact_handle',
      ambiguous: true,
      creator: null,
    });
  });

  it('does not expose protection records attached to an unapproved creator', async () => {
    const creator = await createCreatorRepository(env.DB).create({
      canonicalName: 'Pending Protection Demo',
      entityType: 'person',
      protectionTier: 'critical',
      reviewStatus: 'pending',
    });
    await createReservedHandleRepository(env.DB).create({
      creatorEntityId: creator.id,
      displayHandle: 'pending_protection_demo',
      classification: 'hard_reserved',
      confidenceScore: 100,
      decisionSource: 'test-only pending decision',
      reason: 'This pending record must not cross the public boundary.',
    });

    await expect(checkHandle('pending_protection_demo')).resolves.toMatchObject({
      registry_status: 'not_listed',
      creator: null,
    });
  });

  it('returns null version before publication and the real version after publication', async () => {
    expect((await checkHandle('demo_aurora_vale')).registry_version).toBeNull();
    const repository = createRegistryReleaseRepository(
      env.DB,
      createDeterministicMetadataProvider({
        ids: ['50000000-0000-4000-8000-000000000101'],
        timestamp: '2026-07-01T00:00:00.000Z',
      }),
    );
    const release = await repository.createDraft({
      version: '2026.07.1',
      recordCount: 12,
      checksum: 'phase-three-checksum',
    });
    await repository.publish(release.id);
    await expect(checkHandle('demo_aurora_vale')).resolves.toMatchObject({
      registry_version: '2026.07.1',
      registry_last_updated_at: '2026-07-01T00:00:00.000Z',
    });
  });

  it('validates missing, empty, unsupported, too-short, and too-long handles', async () => {
    for (const path of [
      '/api/v1/handles/check',
      '/api/v1/handles/check?handle=',
      '/api/v1/handles/check?handle=%25bad',
      '/api/v1/handles/check?handle=a',
      `/api/v1/handles/check?handle=${'a'.repeat(31)}`,
    ]) {
      const response = await requestApi(path);
      expect(response.status).toBe(422);
      await expect(response.json()).resolves.toMatchObject({
        error: { code: 'validation_failed' },
      });
    }
  });
});

describe('batch handle checking', () => {
  it('preserves order and duplicates while returning registry metadata once', async () => {
    const response = await requestApi('/api/v1/handles/check-batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        handles: ['ordinary_unlisted_demo', 'demo_aurora_vale', 'ordinary_unlisted_demo'],
      }),
    });
    const body = batchHandleCheckResponseSchema.parse(await response.json());
    expect(response.status).toBe(200);
    expect(body.data.results.map((result) => result.registry_status)).toEqual([
      'not_listed',
      'hard_reserved',
      'not_listed',
    ]);
    expect(body.data.results.map((result) => result.input)).toEqual([
      'ordinary_unlisted_demo',
      'demo_aurora_vale',
      'ordinary_unlisted_demo',
    ]);
    expect(body.data.registry.version).toBeNull();
  });

  it('accepts 50 items and rejects empty, oversized, or invalid batches atomically', async () => {
    const valid = await requestApi('/api/v1/handles/check-batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ handles: Array.from({ length: 50 }, (_, index) => `user_${index}`) }),
    });
    expect(valid.status).toBe(200);

    for (const handles of [
      [],
      Array.from({ length: 51 }, (_, index) => `user_${index}`),
      ['ok_name', '%bad'],
    ]) {
      const response = await requestApi('/api/v1/handles/check-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handles }),
      });
      expect(response.status).toBe(422);
    }
  });

  it('maps a D1 failure to a safe 503 response', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await env.DB.prepare(
      'ALTER TABLE reserved_handles RENAME TO reserved_handles_temporarily_unavailable',
    ).run();
    try {
      const response = await createPublicApp({ metadata: deterministicRequestMetadata }).request(
        '/api/v1/handles/check-batch',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ handles: ['demo_aurora_vale'] }),
        },
        testBindings,
      );
      const text = await response.text();
      expect(response.status).toBe(503);
      expect(text).toContain('database_unavailable');
      expect(text).not.toContain('no such table');
      expect(consoleError).toHaveBeenCalledOnce();
    } finally {
      await env.DB.prepare(
        'ALTER TABLE reserved_handles_temporarily_unavailable RENAME TO reserved_handles',
      ).run();
    }
  });
});
