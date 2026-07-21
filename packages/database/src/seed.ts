import {
  createConfusableSkeleton,
  normalizeCreatorName,
  normalizeHandle,
} from '@open-creator-registry/normalization';
import {
  normalizeExternalProfileUrl,
  normalizePlatformHandle,
} from '@open-creator-registry/normalization/external-profiles';

import { withDatabaseErrorMapping } from './errors';
import { serializeJson } from './json';
import type { JsonValue } from './json';
import {
  demonstrationSeedData,
  demonstrationSeedSchema,
  type DemonstrationSeedData,
} from './seed-data';

export type SeedSummary = {
  label: string;
  creators: number;
  sources: number;
  aliases: number;
  reservedHandles: number;
  externalProfiles: number;
  sourceConfigurations: number;
};

export async function seedDatabase(
  db: D1Database,
  input: DemonstrationSeedData = demonstrationSeedData,
): Promise<SeedSummary> {
  const seed = demonstrationSeedSchema.parse(input);
  const timestamp = seed.metadata.generatedAt;
  const statements: D1PreparedStatement[] = [];

  for (const creator of seed.creators) {
    statements.push(
      db
        .prepare(
          `INSERT INTO creator_entities (
            id, canonical_name, normalized_name, entity_type, primary_category, country_codes,
            biography_summary, notoriety_score, protection_tier, review_status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET canonical_name = excluded.canonical_name,
            normalized_name = excluded.normalized_name, entity_type = excluded.entity_type,
            primary_category = excluded.primary_category, country_codes = excluded.country_codes,
            biography_summary = excluded.biography_summary, notoriety_score = excluded.notoriety_score,
            protection_tier = excluded.protection_tier, review_status = excluded.review_status,
            updated_at = excluded.updated_at`,
        )
        .bind(
          creator.id,
          creator.canonicalName,
          normalizeCreatorName(creator.canonicalName),
          creator.entityType,
          creator.primaryCategory ?? null,
          creator.countryCodes ? serializeJson(creator.countryCodes) : null,
          creator.biographySummary ?? null,
          creator.notorietyScore,
          creator.protectionTier,
          creator.reviewStatus,
          timestamp,
          timestamp,
        ),
    );
  }

  for (const source of seed.sources) {
    statements.push(
      db
        .prepare(
          `INSERT INTO creator_sources (
            id, creator_entity_id, source_name, source_entity_id, source_url, source_license,
            verification_status, last_checked_at, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET creator_entity_id = excluded.creator_entity_id,
            source_name = excluded.source_name, source_entity_id = excluded.source_entity_id,
            source_url = excluded.source_url, source_license = excluded.source_license,
            verification_status = excluded.verification_status,
            last_checked_at = excluded.last_checked_at, updated_at = excluded.updated_at`,
        )
        .bind(
          source.id,
          source.creatorEntityId,
          source.sourceName,
          source.sourceEntityId,
          source.sourceUrl ?? null,
          source.sourceLicense ?? null,
          source.verificationStatus,
          source.lastCheckedAt ?? null,
          timestamp,
          timestamp,
        ),
    );
  }

  for (const alias of seed.aliases) {
    const normalizedAlias = normalizeHandle(alias.alias);
    statements.push(
      db
        .prepare(
          `INSERT INTO creator_aliases (
            id, creator_entity_id, alias, normalized_alias, confusable_skeleton, language,
            alias_type, confidence_score, source_id, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET creator_entity_id = excluded.creator_entity_id,
            alias = excluded.alias, normalized_alias = excluded.normalized_alias,
            confusable_skeleton = excluded.confusable_skeleton, language = excluded.language,
            alias_type = excluded.alias_type, confidence_score = excluded.confidence_score,
            source_id = excluded.source_id, updated_at = excluded.updated_at`,
        )
        .bind(
          alias.id,
          alias.creatorEntityId,
          alias.alias,
          normalizedAlias,
          createConfusableSkeleton(normalizedAlias),
          alias.language ?? null,
          alias.aliasType,
          alias.confidenceScore,
          alias.sourceId ?? null,
          timestamp,
          timestamp,
        ),
    );
  }

  for (const handle of seed.reservedHandles) {
    const normalizedHandle = normalizeHandle(handle.displayHandle);
    statements.push(
      db
        .prepare(
          `INSERT INTO reserved_handles (
            id, creator_entity_id, display_handle, normalized_handle, confusable_skeleton,
            classification, confidence_score, decision_source, reason, status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET creator_entity_id = excluded.creator_entity_id,
            display_handle = excluded.display_handle, normalized_handle = excluded.normalized_handle,
            confusable_skeleton = excluded.confusable_skeleton,
            classification = excluded.classification, confidence_score = excluded.confidence_score,
            decision_source = excluded.decision_source, reason = excluded.reason,
            status = excluded.status, updated_at = excluded.updated_at`,
        )
        .bind(
          handle.id,
          handle.creatorEntityId,
          handle.displayHandle,
          normalizedHandle,
          createConfusableSkeleton(normalizedHandle),
          handle.classification,
          handle.confidenceScore,
          handle.decisionSource,
          handle.reason,
          handle.status,
          timestamp,
          timestamp,
        ),
    );
  }

  for (const profile of seed.externalProfiles) {
    const normalizedHandle = normalizePlatformHandle(profile.platformHandle);
    const normalizedUrl = normalizeExternalProfileUrl(profile.platform, profile.profileUrl);
    statements.push(
      db
        .prepare(
          `INSERT INTO creator_external_profiles (
            id, creator_entity_id, platform, platform_account_id, platform_handle,
            normalized_platform_handle, profile_url, normalized_profile_url, profile_name,
            is_primary, verification_status, visibility_status, source_name, source_reference,
            source_license, confidence_score, connector_version, mapping_version, first_seen_at,
            last_seen_at, last_verified_at, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET creator_entity_id = excluded.creator_entity_id,
            platform = excluded.platform, platform_account_id = excluded.platform_account_id,
            platform_handle = excluded.platform_handle,
            normalized_platform_handle = excluded.normalized_platform_handle,
            profile_url = excluded.profile_url, normalized_profile_url = excluded.normalized_profile_url,
            profile_name = excluded.profile_name, is_primary = excluded.is_primary,
            verification_status = excluded.verification_status,
            visibility_status = excluded.visibility_status, source_name = excluded.source_name,
            source_reference = excluded.source_reference, source_license = excluded.source_license,
            confidence_score = excluded.confidence_score,
            connector_version = excluded.connector_version, mapping_version = excluded.mapping_version,
            last_seen_at = excluded.last_seen_at, last_verified_at = excluded.last_verified_at,
            updated_at = excluded.updated_at`,
        )
        .bind(
          profile.id,
          profile.creatorEntityId,
          profile.platform,
          profile.platformAccountId ?? null,
          profile.platformHandle ?? null,
          normalizedHandle,
          profile.profileUrl ?? null,
          normalizedUrl,
          profile.profileName ?? null,
          profile.isPrimary ? 1 : 0,
          profile.verificationStatus,
          profile.visibilityStatus,
          profile.sourceName,
          profile.sourceReference ?? null,
          profile.sourceLicense ?? null,
          profile.confidenceScore,
          profile.connectorVersion ?? null,
          profile.mappingVersion ?? null,
          timestamp,
          timestamp,
          profile.lastVerifiedAt ?? null,
          timestamp,
          timestamp,
        ),
    );
  }

  for (const configuration of seed.sourceConfigurations) {
    statements.push(
      db
        .prepare(
          `INSERT INTO source_configurations (
            source_name, enabled, scheduled_enabled, connector_version, access_mode, base_url,
            batch_size, maximum_pages_per_run, maximum_records_per_run, timeout_ms, retry_count,
            minimum_request_interval_ms, scope_configuration, candidate_creation_enabled, dry_run,
            source_license, attribution, configuration_status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(source_name) DO NOTHING`,
        )
        .bind(
          configuration.sourceName,
          configuration.enabled ? 1 : 0,
          configuration.scheduledEnabled ? 1 : 0,
          configuration.connectorVersion,
          configuration.accessMode,
          configuration.baseUrl,
          configuration.batchSize,
          configuration.maximumPagesPerRun,
          configuration.maximumRecordsPerRun,
          configuration.timeoutMs,
          configuration.retryCount,
          configuration.minimumRequestIntervalMs,
          serializeJson(configuration.scopeConfiguration as JsonValue),
          configuration.candidateCreationEnabled ? 1 : 0,
          configuration.dryRun ? 1 : 0,
          configuration.sourceLicense,
          configuration.attribution,
          configuration.configurationStatus,
          timestamp,
          timestamp,
        ),
    );
  }

  await withDatabaseErrorMapping('seedDatabase', () => db.batch(statements));

  return {
    label: seed.metadata.label,
    creators: seed.creators.length,
    sources: seed.sources.length,
    aliases: seed.aliases.length,
    reservedHandles: seed.reservedHandles.length,
    externalProfiles: seed.externalProfiles.length,
    sourceConfigurations: seed.sourceConfigurations.length,
  };
}
