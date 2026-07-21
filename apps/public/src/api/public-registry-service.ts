import type { CreatorProtectionTier } from '@open-creator-registry/contracts/domain';
import { createNotFoundError } from '@open-creator-registry/database/errors';
import { createCreatorAliasRepository } from '@open-creator-registry/database/repositories/creator-alias-repository';
import { createCreatorRepository } from '@open-creator-registry/database/repositories/creator-repository';
import { createCreatorSourceRepository } from '@open-creator-registry/database/repositories/creator-source-repository';
import { createPublicRegistryRepository } from '@open-creator-registry/database/repositories/public-registry-repository';
import { createPublicSubmissionRepository } from '@open-creator-registry/database/repositories/public-submission-repository';
import { createRegistryReleaseRepository } from '@open-creator-registry/database/repositories/registry-release-repository';
import { createReservedHandleRepository } from '@open-creator-registry/database/repositories/reserved-handle-repository';
import { createExternalProfileRepository } from '@open-creator-registry/database/repositories/external-profile-repository';

import { apiVersion, registryDisclaimer, registryName, sourcePolicySummary } from './constants';
import {
  mapPublicAlias,
  mapPublicCreator,
  mapPublicHandle,
  mapPublicExternalProfile,
  mapPublicRelease,
  mapPublicSource,
} from './public-mappers';

export type PublicCreatorListInput = {
  query?: string;
  category?: string;
  country?: string;
  protectionTier?: CreatorProtectionTier;
  source?: string;
  page: number;
  limit: number;
  sort: 'canonical_name' | 'created_at' | 'notoriety_score' | 'updated_at';
  order: 'asc' | 'desc';
};

export type PublicSubmissionInput = {
  creatorName: string;
  category?: string | null;
  countryCodes?: string[] | null;
  requestedHandles: string[];
  publicSources: string[];
};

export class DuplicatePublicSubmissionError extends Error {
  constructor() {
    super('An equivalent pending public submission already exists.');
    this.name = 'DuplicatePublicSubmissionError';
  }
}

export function createPublicRegistryService(db: D1Database) {
  const creators = createCreatorRepository(db);
  const aliases = createCreatorAliasRepository(db);
  const handles = createReservedHandleRepository(db);
  const sources = createCreatorSourceRepository(db);
  const releases = createRegistryReleaseRepository(db);
  const registry = createPublicRegistryRepository(db);
  const submissions = createPublicSubmissionRepository(db);
  const externalProfiles = createExternalProfileRepository(db);

  async function listCreators(input: PublicCreatorListInput) {
    const options = {
      query: input.query,
      source: input.source,
      primaryCategory: input.category,
      country: input.country,
      protectionTier: input.protectionTier,
      reviewStatus: 'approved' as const,
      page: input.page,
      limit: input.limit,
      sort: input.sort,
      direction: input.order,
    };
    const [result, total] = await Promise.all([creators.list(options), creators.count(options)]);
    return { ...result, total, items: result.items.map(mapPublicCreator) };
  }

  async function getCreatorDetail(id: string) {
    const creator = await creators.findPublicById(id);
    if (!creator) throw createNotFoundError('creator', id);
    const [aliasResult, handleResult, sourceItems, profileItems] = await Promise.all([
      aliases.listPublicByCreator(id, { page: 1, limit: 100 }),
      handles.listPublicByCreator(id, { page: 1, limit: 100 }),
      sources.listVerifiedByCreator(id),
      externalProfiles.listPublicByCreator(id),
    ]);
    return {
      ...mapPublicCreator(creator),
      aliases: aliasResult.items.map(mapPublicAlias),
      handles: handleResult.items.map(mapPublicHandle),
      sources: sourceItems.map(mapPublicSource),
      external_profiles: profileItems.map(mapPublicExternalProfile),
    };
  }

  async function listCreatorHandles(id: string, page: number, limit: number) {
    const creator = await creators.findPublicById(id);
    if (!creator) throw createNotFoundError('creator', id);
    const [result, total] = await Promise.all([
      handles.listPublicByCreator(id, { page, limit }),
      handles.countPublicByCreator(id),
    ]);
    return { ...result, total, items: result.items.map(mapPublicHandle) };
  }

  async function listCreatorAliases(id: string, page: number, limit: number) {
    const creator = await creators.findPublicById(id);
    if (!creator) throw createNotFoundError('creator', id);
    const [result, total] = await Promise.all([
      aliases.listPublicByCreator(id, { page, limit }),
      aliases.countPublicByCreator(id),
    ]);
    return { ...result, total, items: result.items.map(mapPublicAlias) };
  }

  async function getRegistryMetadata(demonstrationData: boolean) {
    const [snapshot, latestRelease] = await Promise.all([
      registry.getSnapshot(),
      releases.findLatestPublished(),
    ]);
    return {
      name: registryName,
      description:
        'A public registry of creator-handle protection classifications for consuming platforms.',
      api_version: apiVersion,
      current_registry_version: latestRelease?.version ?? null,
      record_counts: {
        approved_creators: snapshot.creatorCount,
        active_reserved_handles: snapshot.activeReservedHandleCount,
      },
      last_published_at: latestRelease?.publishedAt ?? null,
      last_updated_at: snapshot.lastUpdatedAt,
      data_policy_url: '/docs',
      disclaimer: registryDisclaimer,
      source_policy_summary: sourcePolicySummary,
      demonstration_data: demonstrationData,
    };
  }

  async function listPublishedReleases(page: number, limit: number) {
    const [result, total] = await Promise.all([
      releases.listPublic({ page, limit }),
      releases.countPublic(),
    ]);
    return { ...result, total, items: result.items.map(mapPublicRelease) };
  }

  async function createSubmission(input: PublicSubmissionInput) {
    const repositoryInput = {
      creatorName: input.creatorName,
      category: input.category,
      countryCodes: input.countryCodes?.map((country) => country.toUpperCase()) ?? null,
      requestedHandles: input.requestedHandles,
      publicSources: input.publicSources.map((source) => new URL(source).toString()),
    };
    if (await submissions.findPendingDuplicate(repositoryInput)) {
      throw new DuplicatePublicSubmissionError();
    }
    return submissions.create(repositoryInput);
  }

  return {
    checkConnectivity: registry.checkConnectivity,
    listCreators,
    getCreatorDetail,
    listCreatorHandles,
    listCreatorAliases,
    getRegistryMetadata,
    listPublishedReleases,
    createSubmission,
  };
}
