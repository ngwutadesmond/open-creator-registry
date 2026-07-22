import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';

import { createCreatorRepository } from '@open-creator-registry/database/repositories/creator-repository';
import { createCreatorAliasRepository } from '@open-creator-registry/database/repositories/creator-alias-repository';
import { createCreatorSourceRepository } from '@open-creator-registry/database/repositories/creator-source-repository';
import { createExternalProfileRepository } from '@open-creator-registry/database/repositories/external-profile-repository';
import { createRegistryReleaseRepository } from '@open-creator-registry/database/repositories/registry-release-repository';
import { createReservedHandleRepository } from '@open-creator-registry/database/repositories/reserved-handle-repository';
import { createDeterministicMetadataProvider } from '@open-creator-registry/database/runtime';

import {
  creatorAliasesResponseSchema,
  creatorDetailResponseSchema,
  creatorHandlesResponseSchema,
  creatorListResponseSchema,
  creatorProfilesResponseSchema,
  registryMetaResponseSchema,
  registryReleasesResponseSchema,
} from './schemas';
import { requestApi, resetAndSeedApiDatabase } from './test-utils';

beforeEach(resetAndSeedApiDatabase);

describe('public creator routes', () => {
  it('supports default/custom pagination and safe allowlisted sorting', async () => {
    const first = await requestApi('/api/v1/creators');
    const firstBody = creatorListResponseSchema.parse(await first.json());
    expect(first.status).toBe(200);
    expect(firstBody.pagination).toMatchObject({ page: 1, limit: 20, total: 10, total_pages: 1 });
    expect(firstBody.data[0]?.canonical_name).toBe('Demo Alex Lee');

    const custom = await requestApi(
      '/api/v1/creators?page=2&limit=3&sort=notoriety_score&order=desc',
    );
    const customBody = creatorListResponseSchema.parse(await custom.json());
    expect(customBody.pagination).toMatchObject({ page: 2, limit: 3, total: 10, total_pages: 4 });
    expect(customBody.data).toHaveLength(3);

    for (const query of ['limit=101', 'limit=0', 'sort=review_status', 'order=sideways']) {
      const invalid = await requestApi(`/api/v1/creators?${query}`);
      expect(invalid.status).toBe(422);
    }
  });

  it('searches names, aliases, handles, source identifiers, and filters', async () => {
    const cases = [
      ['query=Aurora Vale', 'Demo Aurora Vale'],
      ['query=FrameForge Demo', 'Demo Frame Forge'],
      ['query=demo_nova_quest', 'Demo Nova Quest'],
      ['query=demo-creator-04', 'Demo Kofi Laughs'],
      ['category=visual_art', 'Demo Mira Sol'],
      ['country=NG', 'Demo Amina Bello'],
      ['protection_tier=critical', 'Demo Aurora Vale'],
      ['source=demonstration_catalog&country=ZA', 'Demo River and Reed'],
    ] as const;

    for (const [query, expectedName] of cases) {
      const response = await requestApi(`/api/v1/creators?${query}`);
      const body = creatorListResponseSchema.parse(await response.json());
      expect(body.data.map((creator) => creator.canonical_name)).toContain(expectedName);
    }
  });

  it('never exposes creators that are not publicly approved', async () => {
    const creator = await createCreatorRepository(env.DB).create({
      canonicalName: 'Pending Private Demo',
      entityType: 'person',
      primaryCategory: 'music',
      countryCodes: ['NG'],
      biographySummary: 'Must not be public.',
      notorietyScore: 99,
      protectionTier: 'critical',
      reviewStatus: 'pending',
    });
    const list = creatorListResponseSchema.parse(
      await (await requestApi('/api/v1/creators?query=Pending Private Demo')).json(),
    );
    expect(list.data).toEqual([]);
    const detail = await requestApi(`/api/v1/creators/${creator.id}`);
    expect(detail.status).toBe(404);
    expect(await detail.text()).not.toContain('Pending Private Demo');
  });

  it('does not make unverified aliases publicly searchable', async () => {
    const creatorId = '10000000-0000-4000-8000-000000000001';
    const source = await createCreatorSourceRepository(env.DB).create({
      creatorEntityId: creatorId,
      sourceName: 'unverified_test_source',
      sourceEntityId: 'unverified-alias-source',
      verificationStatus: 'pending',
    });
    await createCreatorAliasRepository(env.DB).create({
      creatorEntityId: creatorId,
      alias: 'Unverified Hidden Alias',
      aliasType: 'known_alias',
      confidenceScore: 70,
      sourceId: source.id,
    });

    const response = await requestApi('/api/v1/creators?query=Unverified%20Hidden%20Alias');
    const body = creatorListResponseSchema.parse(await response.json());
    expect(body.data).toEqual([]);
  });

  it('returns safe creator detail, verified aliases, and active handles', async () => {
    const creatorId = '10000000-0000-4000-8000-000000000001';
    await createExternalProfileRepository(env.DB).create({
      creatorEntityId: creatorId,
      platform: 'twitch',
      platformHandle: '@private-review-only',
      profileUrl: 'https://www.twitch.tv/private-review-only',
      verificationStatus: 'unverified',
      visibilityStatus: 'private',
      sourceName: 'PRIVATE_PROFILE_PROVENANCE',
      confidenceScore: 50,
    });
    await createReservedHandleRepository(env.DB).create({
      creatorEntityId: creatorId,
      displayHandle: '@ordinary_unlisted_demo',
      classification: 'not_listed',
      confidenceScore: 0,
      decisionSource: 'test_fixture',
      reason: 'This absence classification must not be presented as an active reservation.',
    });
    await env.DB.prepare('UPDATE reserved_handles SET reason = ? WHERE id = ?')
      .bind('PRIVATE REVIEW WORDING MUST NOT BE PUBLIC', '40000000-0000-4000-8000-000000000001')
      .run();
    const detailResponse = await requestApi(`/api/v1/creators/${creatorId}`);
    const detail = creatorDetailResponseSchema.parse(await detailResponse.json());
    expect(detail.data.canonical_name).toBe('Demo Aurora Vale');
    expect(detail.data.aliases.length).toBeGreaterThan(0);
    expect(detail.data.handles.length).toBeGreaterThan(0);
    expect(detail.data.sources).toHaveLength(1);
    expect(detail.data.external_profiles).toHaveLength(2);
    expect(detail.data.external_profiles.map((profile) => profile.platform)).not.toContain(
      'twitch',
    );
    expect(JSON.stringify(detail)).not.toContain('decision_source');
    expect(JSON.stringify(detail)).not.toContain('review_status');
    expect(JSON.stringify(detail)).not.toContain('PRIVATE REVIEW WORDING');
    expect(JSON.stringify(detail)).not.toContain('ordinary_unlisted_demo');
    expect(JSON.stringify(detail)).not.toContain('PRIVATE_PROFILE_PROVENANCE');
    expect(detail.data.handles[0]?.reason_summary).toContain('Registry decision');

    const handles = creatorHandlesResponseSchema.parse(
      await (await requestApi(`/api/v1/creators/${creatorId}/handles?limit=1`)).json(),
    );
    expect(handles.data).toHaveLength(1);
    expect(handles.pagination.total).toBe(3);

    const hiddenSearch = creatorListResponseSchema.parse(
      await (await requestApi('/api/v1/creators?query=ordinary_unlisted_demo')).json(),
    );
    expect(hiddenSearch.data).toEqual([]);

    const aliases = creatorAliasesResponseSchema.parse(
      await (await requestApi(`/api/v1/creators/${creatorId}/aliases?limit=1`)).json(),
    );
    expect(aliases.data).toHaveLength(1);
    expect(aliases.pagination.total).toBe(2);

    const profilesResponse = await requestApi(`/api/v1/creators/${creatorId}/profiles`);
    const profiles = creatorProfilesResponseSchema.parse(await profilesResponse.json());
    expect(profilesResponse.headers.get('Cache-Control')).toBe('public, max-age=60, s-maxage=300');
    expect(profiles.data).toHaveLength(2);
    expect(profiles.data.map((profile) => profile.platform)).not.toContain('twitch');
    expect(JSON.stringify(profiles)).not.toContain('PRIVATE_PROFILE_PROVENANCE');

    const unknown = await requestApi('/api/v1/creators/90000000-0000-4000-8000-000000000999');
    expect(unknown.status).toBe(404);
    const unknownProfiles = await requestApi(
      '/api/v1/creators/90000000-0000-4000-8000-000000000999/profiles',
    );
    expect(unknownProfiles.status).toBe(404);
  });
});

describe('public registry metadata and releases', () => {
  it('truthfully returns an unversioned demonstration registry before publication', async () => {
    await createReservedHandleRepository(env.DB).create({
      creatorEntityId: '10000000-0000-4000-8000-000000000001',
      displayHandle: '@unlisted_count_fixture',
      classification: 'not_listed',
      confidenceScore: 0,
      decisionSource: 'test_fixture',
      reason: 'An explicit absence record is not an active protected handle.',
    });
    const response = await requestApi('/api/v1/registry/meta');
    const body = registryMetaResponseSchema.parse(await response.json());
    expect(body.data).toMatchObject({
      current_registry_version: null,
      demonstration_data: true,
      record_counts: { approved_creators: 10, active_reserved_handles: 12 },
    });
    expect(body.data.disclaimer).toContain('not legal ownership');
  });

  it('lists current and superseded published history newest first while excluding drafts and withdrawals', async () => {
    const firstRepository = createRegistryReleaseRepository(
      env.DB,
      createDeterministicMetadataProvider({
        ids: ['50000000-0000-4000-8000-000000000201'],
        timestamp: '2026-05-01T00:00:00.000Z',
      }),
    );
    const first = await firstRepository.createDraft({
      version: '2026.05.1',
      recordCount: 10,
      checksum: 'checksum-may',
    });
    await firstRepository.publish(first.id);

    const secondRepository = createRegistryReleaseRepository(
      env.DB,
      createDeterministicMetadataProvider({
        ids: ['50000000-0000-4000-8000-000000000202', '50000000-0000-4000-8000-000000000203'],
        timestamp: '2026-06-01T00:00:00.000Z',
      }),
    );
    const second = await secondRepository.createDraft({
      version: '2026.06.1',
      recordCount: 12,
      checksum: 'checksum-june',
    });
    await secondRepository.publish(second.id);
    const draft = await secondRepository.createDraft({
      version: '2026.07.1-draft',
      recordCount: 14,
      checksum: 'checksum-draft',
    });
    await env.DB.prepare("UPDATE registry_releases SET release_status = 'withdrawn' WHERE id = ?")
      .bind(draft.id)
      .run();

    const response = await requestApi('/api/v1/registry/releases?limit=1');
    const firstPage = registryReleasesResponseSchema.parse(await response.json());
    expect(firstPage.data.map((release) => release.version)).toEqual(['2026.06.1']);
    expect(firstPage.pagination).toMatchObject({ total: 2, total_pages: 2, has_next_page: true });

    const secondPage = registryReleasesResponseSchema.parse(
      await (await requestApi('/api/v1/registry/releases?page=2&limit=1')).json(),
    );
    expect(secondPage.data.map((release) => release.version)).toEqual(['2026.05.1']);

    const meta = registryMetaResponseSchema.parse(
      await (await requestApi('/api/v1/registry/meta')).json(),
    );
    expect(meta.data.current_registry_version).toBe('2026.06.1');
    expect(meta.data.last_published_at).toBe('2026-06-01T00:00:00.000Z');
  });
});
