import {
  getRecommendedAction,
  type RegistryClassification,
} from '@open-creator-registry/contracts/classifications';
import type { HandleMatchType, ReservationStatus } from '@open-creator-registry/contracts/domain';
import type { CreatorAlias, ReservedHandle } from '@open-creator-registry/database/models';
import { createCreatorAliasRepository } from '@open-creator-registry/database/repositories/creator-alias-repository';
import { createCreatorRepository } from '@open-creator-registry/database/repositories/creator-repository';
import { createPublicRegistryRepository } from '@open-creator-registry/database/repositories/public-registry-repository';
import { createRegistryReleaseRepository } from '@open-creator-registry/database/repositories/registry-release-repository';
import { createReservedHandleRepository } from '@open-creator-registry/database/repositories/reserved-handle-repository';
import { createConfusableSkeleton, normalizeHandle } from '@open-creator-registry/normalization';

import { mapPublicCreator } from './public-mappers';

type MatchCandidate = {
  creatorId: string;
  classification: RegistryClassification;
  matchedBy: HandleMatchType;
  confidenceScore: number;
  reservationStatus: ReservationStatus | null;
  priority: number;
};

export type HandleCheckResult = {
  input: string;
  normalized_handle: string;
  registry_status: RegistryClassification;
  recommended_action: ReturnType<typeof getRecommendedAction>;
  claim_allowed: boolean;
  registration_may_continue: true;
  matched_by: HandleMatchType;
  confidence_score: number;
  ambiguous: boolean;
  creator: ReturnType<typeof mapPublicCreator> | null;
  reservation_status: ReservationStatus | null;
  registry_version: string | null;
  registry_last_updated_at: string | null;
};

function effectiveExactClassification(handle: ReservedHandle): RegistryClassification {
  if (handle.status === 'active') return handle.classification;
  return 'soft_protected';
}

function exactHandlePriority(classification: RegistryClassification): number {
  if (classification === 'hard_reserved') return 900;
  if (classification === 'soft_protected') return 800;
  if (classification === 'monitored') return 700;
  return 0;
}

function candidateFromHandle(
  handle: ReservedHandle,
  normalizedInput: string,
): MatchCandidate | null {
  if (handle.status === 'released' || handle.classification === 'not_listed') return null;
  if (handle.normalizedHandle === normalizedInput) {
    const classification = effectiveExactClassification(handle);
    return {
      creatorId: handle.creatorEntityId,
      classification,
      matchedBy: 'exact_handle',
      confidenceScore: handle.confidenceScore,
      reservationStatus: handle.status,
      priority: exactHandlePriority(classification),
    };
  }
  return {
    creatorId: handle.creatorEntityId,
    classification: 'soft_protected',
    matchedBy: 'confusable_skeleton',
    confidenceScore: Math.min(handle.confidenceScore, 90),
    reservationStatus: handle.status,
    priority: 500,
  };
}

function candidateFromAlias(alias: CreatorAlias, normalizedInput: string): MatchCandidate {
  if (alias.normalizedAlias !== normalizedInput) {
    return {
      creatorId: alias.creatorEntityId,
      classification: 'soft_protected',
      matchedBy: 'confusable_skeleton',
      confidenceScore: Math.min(alias.confidenceScore, 90),
      reservationStatus: null,
      priority: 500,
    };
  }
  if (alias.aliasType === 'official_handle') {
    return {
      creatorId: alias.creatorEntityId,
      classification: 'soft_protected',
      matchedBy: 'official_handle_alias',
      confidenceScore: alias.confidenceScore,
      reservationStatus: null,
      priority: 600,
    };
  }
  if (alias.aliasType === 'protected_variant') {
    return {
      creatorId: alias.creatorEntityId,
      classification: 'soft_protected',
      matchedBy: 'protected_variant',
      confidenceScore: alias.confidenceScore,
      reservationStatus: null,
      priority: 550,
    };
  }
  return {
    creatorId: alias.creatorEntityId,
    classification: 'soft_protected',
    matchedBy: 'alias',
    confidenceScore: alias.confidenceScore,
    reservationStatus: null,
    priority: 400,
  };
}

function compareCandidates(left: MatchCandidate, right: MatchCandidate): number {
  return (
    right.priority - left.priority ||
    right.confidenceScore - left.confidenceScore ||
    left.creatorId.localeCompare(right.creatorId)
  );
}

function policyFields(classification: RegistryClassification) {
  return {
    recommended_action: getRecommendedAction(classification),
    claim_allowed: classification !== 'not_listed',
    registration_may_continue: true as const,
  };
}

export function createHandleCheckService(db: D1Database) {
  const creators = createCreatorRepository(db);
  const aliases = createCreatorAliasRepository(db);
  const handles = createReservedHandleRepository(db);
  const releases = createRegistryReleaseRepository(db);
  const registry = createPublicRegistryRepository(db);

  async function checkMany(inputs: string[]): Promise<{
    results: HandleCheckResult[];
    registryVersion: string | null;
    registryLastUpdatedAt: string | null;
  }> {
    const normalizedInputs = inputs.map((input) => normalizeHandle(input));
    const [handleCandidates, aliasCandidates, latestRelease, snapshot] = await Promise.all([
      handles.findProtectionCandidates(normalizedInputs),
      aliases.findProtectionCandidates(normalizedInputs),
      releases.findLatestPublished(),
      registry.getSnapshot(),
    ]);

    const creatorIds = new Set<string>();
    handleCandidates.forEach((candidate) => creatorIds.add(candidate.creatorEntityId));
    aliasCandidates.forEach((candidate) => creatorIds.add(candidate.creatorEntityId));
    const creatorRecords = await creators.findByIds([...creatorIds]);
    const publicCreators = new Map(
      creatorRecords
        .filter((creator) => creator.reviewStatus === 'approved')
        .map((creator) => [creator.id, mapPublicCreator(creator)]),
    );

    const results = normalizedInputs.map((normalizedInput, index) => {
      const skeleton = createConfusableSkeleton(normalizedInput);
      const candidates = [
        ...handleCandidates
          .filter(
            (candidate) =>
              candidate.normalizedHandle === normalizedInput ||
              candidate.confusableSkeleton === skeleton,
          )
          .map((candidate) => candidateFromHandle(candidate, normalizedInput))
          .filter((candidate): candidate is MatchCandidate => candidate !== null),
        ...aliasCandidates
          .filter(
            (candidate) =>
              candidate.normalizedAlias === normalizedInput ||
              candidate.confusableSkeleton === skeleton,
          )
          .map((candidate) => candidateFromAlias(candidate, normalizedInput)),
      ].sort(compareCandidates);

      const winner = candidates[0];
      if (!winner) {
        return {
          input: inputs[index] ?? '',
          normalized_handle: normalizedInput,
          registry_status: 'not_listed' as const,
          ...policyFields('not_listed'),
          matched_by: 'none' as const,
          confidence_score: 0,
          ambiguous: false,
          creator: null,
          reservation_status: null,
          registry_version: latestRelease?.version ?? null,
          registry_last_updated_at: snapshot.lastUpdatedAt,
        };
      }

      const matchedCreatorIds = new Set(candidates.map((candidate) => candidate.creatorId));
      const ambiguous = matchedCreatorIds.size > 1;
      return {
        input: inputs[index] ?? '',
        normalized_handle: normalizedInput,
        registry_status: winner.classification,
        ...policyFields(winner.classification),
        matched_by: winner.matchedBy,
        confidence_score: winner.confidenceScore,
        ambiguous,
        creator: ambiguous ? null : (publicCreators.get(winner.creatorId) ?? null),
        reservation_status: winner.reservationStatus,
        registry_version: latestRelease?.version ?? null,
        registry_last_updated_at: snapshot.lastUpdatedAt,
      };
    });

    return {
      results,
      registryVersion: latestRelease?.version ?? null,
      registryLastUpdatedAt: snapshot.lastUpdatedAt,
    };
  }

  async function check(input: string): Promise<HandleCheckResult> {
    const result = await checkMany([input]);
    const first = result.results[0];
    if (!first) throw new Error('Handle checking did not produce a result.');
    return first;
  }

  return { check, checkMany };
}
