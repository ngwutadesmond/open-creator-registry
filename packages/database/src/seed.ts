import {
  createConfusableSkeleton,
  normalizeCreatorName,
  normalizeHandle,
} from '@open-creator-registry/normalization';

import { withDatabaseErrorMapping } from './errors';
import { serializeJson } from './json';
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

  await withDatabaseErrorMapping('seedDatabase', () => db.batch(statements));

  return {
    label: seed.metadata.label,
    creators: seed.creators.length,
    sources: seed.sources.length,
    aliases: seed.aliases.length,
    reservedHandles: seed.reservedHandles.length,
  };
}
