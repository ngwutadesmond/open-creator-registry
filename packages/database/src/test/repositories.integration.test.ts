import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';

import { createAuditLogRepository } from '../repositories/audit-log-repository';
import { createCreatorAliasRepository } from '../repositories/creator-alias-repository';
import { createCreatorCandidateRepository } from '../repositories/creator-candidate-repository';
import { createCreatorRepository } from '../repositories/creator-repository';
import { createCreatorSourceRepository } from '../repositories/creator-source-repository';
import { createIngestionRunRepository } from '../repositories/ingestion-run-repository';
import { createPublicSubmissionRepository } from '../repositories/public-submission-repository';
import { createRegistryReleaseRepository } from '../repositories/registry-release-repository';
import { createReservedHandleRepository } from '../repositories/reserved-handle-repository';
import { createDeterministicMetadataProvider } from '../runtime';
import { clearDatabase, createTestCreator } from './test-utils';

beforeEach(clearDatabase);

describe('creator repository', () => {
  it('creates, retrieves, and updates a creator with JSON fields', async () => {
    const repository = createCreatorRepository(env.DB);
    const creator = await repository.create({
      canonicalName: '  Creator Example  ',
      entityType: 'person',
      primaryCategory: 'video',
      countryCodes: ['NG', 'GH'],
      biographySummary: 'Test biography.',
      notorietyScore: 71,
      protectionTier: 'notable',
      reviewStatus: 'pending',
    });
    const updated = await repository.update(creator.id, {
      canonicalName: 'Creator Example Updated',
      reviewStatus: 'approved',
      countryCodes: ['NG'],
    });

    expect(await repository.findById(creator.id)).toMatchObject({
      canonicalName: 'Creator Example Updated',
      normalizedName: 'creator example updated',
      countryCodes: ['NG'],
      reviewStatus: 'approved',
    });
    expect(updated.id).toBe(creator.id);
  });

  it('supports deterministic pagination, sorting, counting, and filters', async () => {
    const repository = createCreatorRepository(env.DB);
    await createTestCreator({
      canonicalName: 'Gamma Creator',
      primaryCategory: 'music',
      countryCodes: ['NG'],
    });
    await createTestCreator({
      canonicalName: 'Alpha Creator',
      primaryCategory: 'video',
      countryCodes: ['CA'],
    });
    await createTestCreator({
      canonicalName: 'Beta Creator',
      primaryCategory: 'music',
      countryCodes: ['NG'],
    });

    const firstPage = await repository.list({
      page: 1,
      limit: 2,
      sort: 'canonical_name',
      direction: 'asc',
    });
    const filtered = await repository.list({ primaryCategory: 'music', country: 'ng', limit: 10 });

    expect(firstPage.items.map((creator) => creator.canonicalName)).toEqual([
      'Alpha Creator',
      'Beta Creator',
    ]);
    expect(filtered.items).toHaveLength(2);
    expect(await repository.count({ primaryCategory: 'music', country: 'NG' })).toBe(2);
  });

  it('finds creators by comparison-friendly normalized name', async () => {
    await createTestCreator({ canonicalName: 'Demo.Creator-Name' });
    const matches = await createCreatorRepository(env.DB).findByNormalizedName('demo creator name');
    expect(matches).toHaveLength(1);
  });

  it('searches creator names, aliases, active handles, and verified source identifiers', async () => {
    const creators = createCreatorRepository(env.DB);
    const creator = await createTestCreator({ canonicalName: 'Distinctive Registry Person' });
    const source = await createCreatorSourceRepository(env.DB).create({
      creatorEntityId: creator.id,
      sourceName: 'integration_catalog',
      sourceEntityId: 'verified-source-42',
      verificationStatus: 'verified',
    });
    await createCreatorAliasRepository(env.DB).create({
      creatorEntityId: creator.id,
      alias: 'Hidden Stage Name',
      aliasType: 'stage_name',
      confidenceScore: 95,
      sourceId: source.id,
    });
    await createReservedHandleRepository(env.DB).create({
      creatorEntityId: creator.id,
      displayHandle: '@distinctive.official',
      classification: 'hard_reserved',
      confidenceScore: 100,
      decisionSource: 'integration_test',
      reason: 'Active handle used to verify creator repository search.',
    });
    for (const query of [
      'registry person',
      'hidden-stage',
      '@distinctive_official',
      'verified-source-42',
    ]) {
      expect((await creators.list({ query })).items.map((item) => item.id)).toEqual([creator.id]);
      expect(await creators.count({ query })).toBe(1);
    }
  });

  it('does not expose released handles or unverified source identifiers through creator search', async () => {
    const creators = createCreatorRepository(env.DB);
    const creator = await createTestCreator({ canonicalName: 'Search Boundary Person' });
    await createReservedHandleRepository(env.DB).create({
      creatorEntityId: creator.id,
      displayHandle: 'released_search_handle',
      classification: 'hard_reserved',
      confidenceScore: 100,
      decisionSource: 'integration_test',
      reason: 'Released handle used to verify the public-search repository boundary.',
      status: 'released',
    });
    await createCreatorSourceRepository(env.DB).create({
      creatorEntityId: creator.id,
      sourceName: 'integration_catalog',
      sourceEntityId: 'pending-source-42',
      verificationStatus: 'pending',
    });

    expect((await creators.list({ query: 'released_search_handle' })).items).toEqual([]);
    expect((await creators.list({ query: 'pending-source-42' })).items).toEqual([]);
    expect((await creators.list({ query: '%' })).items).toEqual([]);
  });
});

describe('alias and reserved-handle repositories', () => {
  it('creates and retrieves multiple aliases for one creator', async () => {
    const creator = await createTestCreator();
    const repository = createCreatorAliasRepository(env.DB);
    await repository.create({
      creatorEntityId: creator.id,
      alias: 'First Alias',
      aliasType: 'stage_name',
      confidenceScore: 95,
    });
    const second = await repository.create({
      creatorEntityId: creator.id,
      alias: 'Official.Creator',
      aliasType: 'official_handle',
      confidenceScore: 100,
    });

    expect(await repository.listByCreator(creator.id)).toHaveLength(2);
    expect(await repository.findByNormalizedAlias('official-creator')).toEqual([second]);
    await repository.delete(second.id);
    expect(await repository.findById(second.id)).toBeNull();
  });

  it('creates, lists, and updates creator evidence sources', async () => {
    const creator = await createTestCreator();
    const repository = createCreatorSourceRepository(env.DB);
    const source = await repository.create({
      creatorEntityId: creator.id,
      sourceName: 'integration_catalog',
      sourceEntityId: 'creator-42',
      sourceUrl: 'https://example.test/creator-42',
      sourceLicense: 'Test fixture',
      verificationStatus: 'pending',
    });
    const updated = await repository.update(source.id, {
      verificationStatus: 'verified',
      lastCheckedAt: '2026-03-01T00:00:00.000Z',
    });

    expect(await repository.findById(source.id)).toEqual(updated);
    expect(await repository.listByCreator(creator.id)).toEqual([updated]);
    expect(updated.verificationStatus).toBe('verified');
  });

  it('performs exact and confusable-skeleton reserved-handle lookups', async () => {
    const creator = await createTestCreator();
    const repository = createReservedHandleRepository(env.DB);
    const reserved = await repository.create({
      creatorEntityId: creator.id,
      displayHandle: '@creator.official',
      classification: 'hard_reserved',
      confidenceScore: 100,
      decisionSource: 'integration_test',
      reason: 'Exact reserved handle used for repository lookup integration testing.',
    });

    expect(await repository.findExact(' CREATOR-OFFICIAL ')).toEqual(reserved);
    expect(await repository.findByConfusableSkeleton('creatоr_official')).toEqual([reserved]);
    expect(await repository.listByCreator(creator.id)).toEqual([reserved]);
    expect(await repository.count({ classification: 'hard_reserved', status: 'active' })).toBe(1);
    expect(await repository.updateStatus(reserved.id, 'suspended')).toMatchObject({
      status: 'suspended',
    });
  });
});

describe('review and submission repositories', () => {
  it('creates and reviews a candidate', async () => {
    const repository = createCreatorCandidateRepository(env.DB);
    const candidate = await repository.create({
      canonicalName: 'Candidate Creator',
      category: 'music',
      countryCodes: ['NG'],
      discoverySource: 'integration_test',
      confidenceScore: 77,
    });
    const reviewed = await repository.updateReviewStatus(candidate.id, 'approved');

    expect(reviewed).toMatchObject({ reviewStatus: 'approved', countryCodes: ['NG'] });
    expect(reviewed.reviewedAt).not.toBeNull();
    expect((await repository.list({ reviewStatus: 'approved' })).items).toEqual([reviewed]);
  });

  it('round-trips public-submission JSON fields and updates status', async () => {
    const repository = createPublicSubmissionRepository(env.DB);
    const submission = await repository.create({
      creatorName: 'Submission Creator',
      category: 'video',
      countryCodes: ['KE'],
      requestedHandles: ['@submission.creator', 'real-submission-creator'],
      publicSources: ['https://example.test/source'],
    });
    const reviewed = await repository.updateStatus(submission.id, 'under_review');

    expect(reviewed).toMatchObject({
      countryCodes: ['KE'],
      requestedHandles: ['@submission.creator', 'real-submission-creator'],
      publicSources: ['https://example.test/source'],
      submissionStatus: 'under_review',
    });
  });
});

describe('release, ingestion, and audit repositories', () => {
  it('publishes releases atomically and selects only the latest published release', async () => {
    const firstRepository = createRegistryReleaseRepository(
      env.DB,
      createDeterministicMetadataProvider({
        ids: ['50000000-0000-4000-8000-000000000001'],
        timestamp: '2026-01-01T00:00:00.000Z',
      }),
    );
    const first = await firstRepository.createDraft({
      version: '2026.01.1',
      recordCount: 10,
      checksum: 'checksum-one',
    });
    await firstRepository.publish(first.id);

    const secondRepository = createRegistryReleaseRepository(
      env.DB,
      createDeterministicMetadataProvider({
        ids: ['50000000-0000-4000-8000-000000000002'],
        timestamp: '2026-02-01T00:00:00.000Z',
      }),
    );
    const second = await secondRepository.createDraft({
      version: '2026.02.1',
      recordCount: 12,
      checksum: 'checksum-two',
    });
    await secondRepository.publish(second.id);

    expect(await secondRepository.findLatestPublished()).toMatchObject({
      id: second.id,
      releaseStatus: 'published',
    });
    expect(await firstRepository.findById(first.id)).toMatchObject({ releaseStatus: 'superseded' });
    await expect(secondRepository.publish(second.id)).rejects.toMatchObject({
      code: 'invalid_input',
    });
    await expect(
      secondRepository.publish('50000000-0000-4000-8000-000000000999'),
    ).rejects.toMatchObject({ code: 'not_found' });
  });

  it('rolls back the entire release publication batch when publication fails', async () => {
    const firstRepository = createRegistryReleaseRepository(
      env.DB,
      createDeterministicMetadataProvider({
        ids: ['50000000-0000-4000-8000-000000000011'],
        timestamp: '2026-03-01T00:00:00.000Z',
      }),
    );
    const first = await firstRepository.createDraft({
      version: '2026.03.1',
      recordCount: 12,
      checksum: 'checksum-current',
    });
    await firstRepository.publish(first.id);

    const secondRepository = createRegistryReleaseRepository(
      env.DB,
      createDeterministicMetadataProvider({
        ids: ['50000000-0000-4000-8000-000000000012'],
        timestamp: '2026-04-01T00:00:00.000Z',
      }),
    );
    const second = await secondRepository.createDraft({
      version: '2026.04.1',
      recordCount: 14,
      checksum: 'checksum-next',
    });

    await env.DB.prepare(
      `CREATE TRIGGER reject_test_release_publication
       BEFORE UPDATE OF release_status ON registry_releases
       WHEN OLD.id = '${second.id}' AND NEW.release_status = 'published'
       BEGIN
         SELECT RAISE(ABORT, 'deliberate publication failure');
       END`,
    ).run();

    try {
      await expect(secondRepository.publish(second.id)).rejects.toMatchObject({
        code: 'database_failure',
      });
    } finally {
      await env.DB.prepare('DROP TRIGGER reject_test_release_publication').run();
    }

    expect(await firstRepository.findById(first.id)).toMatchObject({
      releaseStatus: 'published',
    });
    expect(await secondRepository.findById(second.id)).toMatchObject({ releaseStatus: 'draft' });
    expect(await secondRepository.findLatestPublished()).toMatchObject({ id: first.id });
  });

  it('records ingestion status transitions and rejects negative counters', async () => {
    const repository = createIngestionRunRepository(env.DB);
    const run = await repository.create('integration_source');
    expect((await repository.markRunning(run.id)).status).toBe('running');
    const completed = await repository.markCompleted(run.id, {
      importedCount: 4,
      updatedCount: 2,
      skippedCount: 1,
      failedCount: 1,
    });

    expect(completed.status).toBe('completed_with_errors');
    await expect(
      repository.markCompleted(run.id, {
        importedCount: -1,
        updatedCount: 0,
        skippedCount: 0,
        failedCount: 0,
      }),
    ).rejects.toMatchObject({ code: 'invalid_input' });
  });

  it('appends and retrieves immutable audit records with JSON values', async () => {
    const repository = createAuditLogRepository(env.DB);
    const log = await repository.append({
      action: 'creator.created',
      entityType: 'creator',
      entityId: 'creator-1',
      actorIdentifier: 'integration-test@example.invalid',
      previousValue: null,
      newValue: { reviewStatus: 'pending' },
      metadata: { requestId: 'request-1', automated: false },
    });

    expect(await repository.findByEntity('creator', 'creator-1')).toEqual([log]);
    expect((await repository.list({ action: 'creator.created' })).items).toEqual([log]);
    expect('update' in repository).toBe(false);
    expect('delete' in repository).toBe(false);
  });
});
