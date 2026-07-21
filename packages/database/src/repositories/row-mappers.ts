import type { RegistryClassification } from '@open-creator-registry/contracts/classifications';
import type {
  AliasType,
  CandidateStatus,
  CreatorProtectionTier,
  CreatorReviewStatus,
  IngestionStatus,
  RegistryReleaseStatus,
  ReservationStatus,
  SourceVerificationStatus,
  SubmissionStatus,
} from '@open-creator-registry/contracts/domain';

import { parseJson, parseRequiredStringArray, parseStringArray } from '../json';
import type {
  AuditLog,
  CreatorAlias,
  CreatorCandidate,
  CreatorEntity,
  CreatorSource,
  IngestionRun,
  PublicSubmission,
  RegistryRelease,
  ReservedHandle,
} from '../models';

export type CreatorEntityRow = {
  id: string;
  canonical_name: string;
  normalized_name: string;
  entity_type: string;
  primary_category: string | null;
  country_codes: string | null;
  biography_summary: string | null;
  notoriety_score: number;
  protection_tier: string;
  review_status: string;
  created_at: string;
  updated_at: string;
};

export function mapCreatorEntity(row: CreatorEntityRow): CreatorEntity {
  return {
    id: row.id,
    canonicalName: row.canonical_name,
    normalizedName: row.normalized_name,
    entityType: row.entity_type,
    primaryCategory: row.primary_category,
    countryCodes: parseStringArray(row.country_codes, 'creator_entities.country_codes'),
    biographySummary: row.biography_summary,
    notorietyScore: row.notoriety_score,
    protectionTier: row.protection_tier as CreatorProtectionTier,
    reviewStatus: row.review_status as CreatorReviewStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export type CreatorAliasRow = {
  id: string;
  creator_entity_id: string;
  alias: string;
  normalized_alias: string;
  confusable_skeleton: string;
  language: string | null;
  alias_type: string;
  confidence_score: number;
  source_id: string | null;
  created_at: string;
  updated_at: string;
};

export function mapCreatorAlias(row: CreatorAliasRow): CreatorAlias {
  return {
    id: row.id,
    creatorEntityId: row.creator_entity_id,
    alias: row.alias,
    normalizedAlias: row.normalized_alias,
    confusableSkeleton: row.confusable_skeleton,
    language: row.language,
    aliasType: row.alias_type as AliasType,
    confidenceScore: row.confidence_score,
    sourceId: row.source_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export type CreatorSourceRow = {
  id: string;
  creator_entity_id: string;
  source_name: string;
  source_entity_id: string;
  source_url: string | null;
  source_license: string | null;
  verification_status: string;
  last_checked_at: string | null;
  created_at: string;
  updated_at: string;
};

export function mapCreatorSource(row: CreatorSourceRow): CreatorSource {
  return {
    id: row.id,
    creatorEntityId: row.creator_entity_id,
    sourceName: row.source_name,
    sourceEntityId: row.source_entity_id,
    sourceUrl: row.source_url,
    sourceLicense: row.source_license,
    verificationStatus: row.verification_status as SourceVerificationStatus,
    lastCheckedAt: row.last_checked_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export type ReservedHandleRow = {
  id: string;
  creator_entity_id: string;
  display_handle: string;
  normalized_handle: string;
  confusable_skeleton: string;
  classification: string;
  confidence_score: number;
  decision_source: string;
  reason: string;
  status: string;
  created_at: string;
  updated_at: string;
};

export function mapReservedHandle(row: ReservedHandleRow): ReservedHandle {
  return {
    id: row.id,
    creatorEntityId: row.creator_entity_id,
    displayHandle: row.display_handle,
    normalizedHandle: row.normalized_handle,
    confusableSkeleton: row.confusable_skeleton,
    classification: row.classification as RegistryClassification,
    confidenceScore: row.confidence_score,
    decisionSource: row.decision_source,
    reason: row.reason,
    status: row.status as ReservationStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export type CreatorCandidateRow = {
  id: string;
  canonical_name: string;
  normalized_name: string;
  category: string | null;
  country_codes: string | null;
  discovery_source: string;
  confidence_score: number;
  review_status: string;
  discovered_at: string;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
};

export function mapCreatorCandidate(row: CreatorCandidateRow): CreatorCandidate {
  return {
    id: row.id,
    canonicalName: row.canonical_name,
    normalizedName: row.normalized_name,
    category: row.category,
    countryCodes: parseStringArray(row.country_codes, 'creator_candidates.country_codes'),
    discoverySource: row.discovery_source,
    confidenceScore: row.confidence_score,
    reviewStatus: row.review_status as CandidateStatus,
    discoveredAt: row.discovered_at,
    reviewedAt: row.reviewed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export type PublicSubmissionRow = {
  id: string;
  creator_name: string;
  category: string | null;
  country_codes: string | null;
  requested_handles: string;
  public_sources: string;
  submission_status: string;
  created_at: string;
  reviewed_at: string | null;
  updated_at: string;
};

export function mapPublicSubmission(row: PublicSubmissionRow): PublicSubmission {
  return {
    id: row.id,
    creatorName: row.creator_name,
    category: row.category,
    countryCodes: parseStringArray(row.country_codes, 'public_submissions.country_codes'),
    requestedHandles: parseRequiredStringArray(
      row.requested_handles,
      'public_submissions.requested_handles',
    ),
    publicSources: parseRequiredStringArray(
      row.public_sources,
      'public_submissions.public_sources',
    ),
    submissionStatus: row.submission_status as SubmissionStatus,
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at,
    updatedAt: row.updated_at,
  };
}

export type RegistryReleaseRow = {
  id: string;
  version: string;
  record_count: number;
  checksum: string;
  release_status: string;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

export function mapRegistryRelease(row: RegistryReleaseRow): RegistryRelease {
  return {
    id: row.id,
    version: row.version,
    recordCount: row.record_count,
    checksum: row.checksum,
    releaseStatus: row.release_status as RegistryReleaseStatus,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export type IngestionRunRow = {
  id: string;
  source_name: string;
  status: string;
  imported_count: number;
  updated_count: number;
  skipped_count: number;
  failed_count: number;
  error_summary: string | null;
  started_at: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export function mapIngestionRun(row: IngestionRunRow): IngestionRun {
  return {
    id: row.id,
    sourceName: row.source_name,
    status: row.status as IngestionStatus,
    importedCount: row.imported_count,
    updatedCount: row.updated_count,
    skippedCount: row.skipped_count,
    failedCount: row.failed_count,
    errorSummary: row.error_summary,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export type AuditLogRow = {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  actor_identifier: string;
  previous_value: string | null;
  new_value: string | null;
  metadata: string | null;
  created_at: string;
};

export function mapAuditLog(row: AuditLogRow): AuditLog {
  return {
    id: row.id,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    actorIdentifier: row.actor_identifier,
    previousValue: row.previous_value
      ? parseJson(row.previous_value, 'audit_logs.previous_value')
      : null,
    newValue: row.new_value ? parseJson(row.new_value, 'audit_logs.new_value') : null,
    metadata: row.metadata ? parseJson(row.metadata, 'audit_logs.metadata') : null,
    createdAt: row.created_at,
  };
}
