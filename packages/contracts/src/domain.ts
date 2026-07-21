export const creatorProtectionTiers = ['critical', 'notable', 'watchlist', 'standard'] as const;
export type CreatorProtectionTier = (typeof creatorProtectionTiers)[number];

export const creatorReviewStatuses = [
  'pending',
  'approved',
  'rejected',
  'disputed',
  'suspended',
] as const;
export type CreatorReviewStatus = (typeof creatorReviewStatuses)[number];

export const reservationStatuses = ['active', 'suspended', 'released', 'disputed'] as const;
export type ReservationStatus = (typeof reservationStatuses)[number];

export const aliasTypes = [
  'canonical',
  'stage_name',
  'former_name',
  'transliteration',
  'official_handle',
  'protected_variant',
  'known_alias',
] as const;
export type AliasType = (typeof aliasTypes)[number];

export const sourceVerificationStatuses = ['pending', 'verified', 'rejected', 'stale'] as const;
export type SourceVerificationStatus = (typeof sourceVerificationStatuses)[number];

export const candidateStatuses = ['pending', 'approved', 'rejected', 'merged'] as const;
export type CandidateStatus = (typeof candidateStatuses)[number];

export const submissionStatuses = ['pending', 'under_review', 'approved', 'rejected'] as const;
export type SubmissionStatus = (typeof submissionStatuses)[number];

export const registryReleaseStatuses = ['draft', 'published', 'superseded', 'withdrawn'] as const;
export type RegistryReleaseStatus = (typeof registryReleaseStatuses)[number];

export const ingestionStatuses = [
  'pending',
  'running',
  'completed',
  'completed_with_errors',
  'failed',
] as const;
export type IngestionStatus = (typeof ingestionStatuses)[number];

export const handleMatchTypes = [
  'exact_handle',
  'official_handle_alias',
  'protected_variant',
  'alias',
  'confusable_skeleton',
  'monitored_variant',
  'none',
] as const;
export type HandleMatchType = (typeof handleMatchTypes)[number];
