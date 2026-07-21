export const sourceAccessModes = [
  'open_dataset',
  'official_api',
  'approved_public_web',
  'manual_import',
] as const;
export type SourceAccessMode = (typeof sourceAccessModes)[number];

export const sourceConfigurationStatuses = ['valid', 'invalid', 'unavailable'] as const;
export type SourceConfigurationStatus = (typeof sourceConfigurationStatuses)[number];

export const connectorReadinessStatuses = [
  'ready',
  'disabled',
  'invalid_configuration',
  'not_implemented',
] as const;
export type ConnectorReadinessStatus = (typeof connectorReadinessStatuses)[number];

export const ingestionTriggerTypes = ['manual_preview', 'manual', 'scheduled'] as const;
export type IngestionTriggerType = (typeof ingestionTriggerTypes)[number];

export const ingestionOutcomeStatuses = [
  'created',
  'updated',
  'duplicate',
  'skipped',
  'failed',
  'previewed',
] as const;
export type IngestionOutcomeStatus = (typeof ingestionOutcomeStatuses)[number];

export const entityMatchRecommendations = [
  'no_existing_match',
  'likely_existing_creator',
  'possible_existing_creator',
  'conflicting_identity',
  'manual_review_required',
] as const;
export type EntityMatchRecommendation = (typeof entityMatchRecommendations)[number];

export const externalProfilePlatforms = [
  'youtube',
  'spotify',
  'tiktok',
  'instagram',
  'x',
  'facebook',
  'twitch',
  'soundcloud',
  'apple_music',
  'official_website',
  'other',
] as const;
export type ExternalProfilePlatform = (typeof externalProfilePlatforms)[number];

export const externalProfileVerificationStatuses = [
  'unverified',
  'source_linked',
  'cross_source_confirmed',
  'manually_verified',
  'creator_verified',
  'stale',
  'disputed',
  'rejected',
] as const;
export type ExternalProfileVerificationStatus =
  (typeof externalProfileVerificationStatuses)[number];

export const externalProfileVisibilityStatuses = ['public', 'private', 'suppressed'] as const;
export type ExternalProfileVisibilityStatus = (typeof externalProfileVisibilityStatuses)[number];
