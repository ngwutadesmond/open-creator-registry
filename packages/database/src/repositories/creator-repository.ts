import type {
  CreatorProtectionTier,
  CreatorReviewStatus,
} from '@open-creator-registry/contracts/domain';
import { normalizeCreatorName, validateHandle } from '@open-creator-registry/normalization';

import { createNotFoundError } from '../errors';
import { serializeJson } from '../json';
import type { CreatorEntity, PaginatedResult, Pagination } from '../models';
import { defaultRecordMetadataProvider, type RecordMetadataProvider } from '../runtime';
import { mapCreatorEntity, type CreatorEntityRow } from './row-mappers';
import { allRows, firstRow, resolvePagination, runStatement } from './shared';

export type CreateCreatorInput = {
  canonicalName: string;
  entityType: string;
  primaryCategory?: string | null;
  countryCodes?: string[] | null;
  biographySummary?: string | null;
  notorietyScore?: number;
  protectionTier: CreatorProtectionTier;
  reviewStatus: CreatorReviewStatus;
};

export type UpdateCreatorInput = Partial<CreateCreatorInput>;

export type CreatorListOptions = Pagination & {
  query?: string;
  source?: string;
  primaryCategory?: string;
  country?: string;
  protectionTier?: CreatorProtectionTier;
  reviewStatus?: CreatorReviewStatus;
  sort?: 'canonical_name' | 'created_at' | 'notoriety_score' | 'updated_at';
  direction?: 'asc' | 'desc';
};

const creatorOrderColumns = {
  canonical_name: 'canonical_name',
  created_at: 'created_at',
  notoriety_score: 'notoriety_score',
  updated_at: 'updated_at',
} as const;

function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/gu, '\\$&');
}

export function createCreatorRepository(
  db: D1Database,
  metadata: RecordMetadataProvider = defaultRecordMetadataProvider,
) {
  async function findById(id: string): Promise<CreatorEntity | null> {
    const row = await firstRow<CreatorEntityRow>(
      db.prepare('SELECT * FROM creator_entities WHERE id = ? LIMIT 1').bind(id),
      'creator.findById',
    );
    return row ? mapCreatorEntity(row) : null;
  }

  async function findPublicById(id: string): Promise<CreatorEntity | null> {
    const row = await firstRow<CreatorEntityRow>(
      db
        .prepare(
          "SELECT * FROM creator_entities WHERE id = ? AND review_status = 'approved' LIMIT 1",
        )
        .bind(id),
      'creator.findPublicById',
    );
    return row ? mapCreatorEntity(row) : null;
  }

  async function findByIds(ids: string[]): Promise<CreatorEntity[]> {
    if (ids.length === 0) return [];
    const rows = await allRows<CreatorEntityRow>(
      db
        .prepare(
          `SELECT * FROM creator_entities
           WHERE id IN (SELECT value FROM json_each(?))
           ORDER BY created_at, id`,
        )
        .bind(serializeJson(ids)),
      'creator.findByIds',
    );
    return rows.map(mapCreatorEntity);
  }

  async function create(input: CreateCreatorInput): Promise<CreatorEntity> {
    const id = metadata.createId();
    const timestamp = metadata.now();
    await runStatement(
      db
        .prepare(
          `INSERT INTO creator_entities (
            id, canonical_name, normalized_name, entity_type, primary_category, country_codes,
            biography_summary, notoriety_score, protection_tier, review_status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          id,
          input.canonicalName.trim(),
          normalizeCreatorName(input.canonicalName),
          input.entityType,
          input.primaryCategory ?? null,
          input.countryCodes ? serializeJson(input.countryCodes) : null,
          input.biographySummary ?? null,
          input.notorietyScore ?? 0,
          input.protectionTier,
          input.reviewStatus,
          timestamp,
          timestamp,
        ),
      'creator.create',
    );
    const created = await findById(id);
    if (!created) throw createNotFoundError('creator', id);
    return created;
  }

  async function findByNormalizedName(name: string): Promise<CreatorEntity[]> {
    const rows = await allRows<CreatorEntityRow>(
      db
        .prepare('SELECT * FROM creator_entities WHERE normalized_name = ? ORDER BY created_at, id')
        .bind(normalizeCreatorName(name)),
      'creator.findByNormalizedName',
    );
    return rows.map(mapCreatorEntity);
  }

  function createFilterBinding(options: CreatorListOptions) {
    const query = options.query?.trim() || null;
    const normalizedName = query ? normalizeCreatorName(query) : null;
    const handleValidation = query ? validateHandle(query) : null;
    const normalizedHandle = handleValidation?.valid ? handleValidation.normalized : null;

    return [
      query,
      normalizedName ? `%${escapeLikePattern(normalizedName)}%` : null,
      normalizedHandle ? `%${escapeLikePattern(normalizedHandle)}%` : null,
      normalizedHandle ? `%${escapeLikePattern(normalizedHandle)}%` : null,
      query,
      options.primaryCategory ?? null,
      options.primaryCategory ?? null,
      options.country?.toUpperCase() ?? null,
      options.country?.toUpperCase() ?? null,
      options.protectionTier ?? null,
      options.protectionTier ?? null,
      options.reviewStatus ?? null,
      options.reviewStatus ?? null,
      options.source ?? null,
      options.source ?? null,
    ] as const;
  }

  async function list(options: CreatorListOptions = {}): Promise<PaginatedResult<CreatorEntity>> {
    const { page, limit, offset } = resolvePagination(options);
    const sort = options.sort ?? 'created_at';
    const direction = options.direction ?? 'desc';
    const orderColumn = creatorOrderColumns[sort];
    const orderDirection = direction === 'asc' ? 'ASC' : 'DESC';
    const rows = await allRows<CreatorEntityRow>(
      db
        .prepare(
          `SELECT * FROM creator_entities e
           WHERE (? IS NULL
             OR e.normalized_name LIKE ? ESCAPE '\\'
             OR EXISTS (
               SELECT 1 FROM creator_aliases alias
               JOIN creator_sources alias_source ON alias_source.id = alias.source_id
               WHERE alias.creator_entity_id = e.id
                 AND alias_source.verification_status = 'verified'
                 AND alias.normalized_alias LIKE ? ESCAPE '\\'
             )
             OR EXISTS (
               SELECT 1 FROM reserved_handles handle
               WHERE handle.creator_entity_id = e.id AND handle.status = 'active'
                 AND handle.classification <> 'not_listed'
                 AND handle.normalized_handle LIKE ? ESCAPE '\\'
             )
             OR EXISTS (
               SELECT 1 FROM creator_sources source
               WHERE source.creator_entity_id = e.id AND source.verification_status = 'verified'
                 AND source.source_entity_id = ?
             )
           )
             AND (? IS NULL OR e.primary_category = ?)
             AND (? IS NULL OR EXISTS (
               SELECT 1 FROM json_each(e.country_codes) country WHERE country.value = ?
             ))
             AND (? IS NULL OR e.protection_tier = ?)
             AND (? IS NULL OR e.review_status = ?)
             AND (? IS NULL OR EXISTS (
               SELECT 1 FROM creator_sources source_filter
               WHERE source_filter.creator_entity_id = e.id
                 AND source_filter.verification_status = 'verified'
                 AND source_filter.source_name = ?
             ))
           ORDER BY ${orderColumn} ${orderDirection}, id ${orderDirection}
           LIMIT ? OFFSET ?`,
        )
        .bind(...createFilterBinding(options), limit, offset),
      'creator.list',
    );
    return { items: rows.map(mapCreatorEntity), page, limit };
  }

  async function update(id: string, input: UpdateCreatorInput): Promise<CreatorEntity> {
    const current = await findById(id);
    if (!current) throw createNotFoundError('creator', id);
    const merged: CreateCreatorInput = {
      canonicalName: input.canonicalName ?? current.canonicalName,
      entityType: input.entityType ?? current.entityType,
      primaryCategory:
        input.primaryCategory === undefined ? current.primaryCategory : input.primaryCategory,
      countryCodes: input.countryCodes === undefined ? current.countryCodes : input.countryCodes,
      biographySummary:
        input.biographySummary === undefined ? current.biographySummary : input.biographySummary,
      notorietyScore: input.notorietyScore ?? current.notorietyScore,
      protectionTier: input.protectionTier ?? current.protectionTier,
      reviewStatus: input.reviewStatus ?? current.reviewStatus,
    };
    await runStatement(
      db
        .prepare(
          `UPDATE creator_entities SET canonical_name = ?, normalized_name = ?, entity_type = ?,
           primary_category = ?, country_codes = ?, biography_summary = ?, notoriety_score = ?,
           protection_tier = ?, review_status = ?, updated_at = ? WHERE id = ?`,
        )
        .bind(
          merged.canonicalName.trim(),
          normalizeCreatorName(merged.canonicalName),
          merged.entityType,
          merged.primaryCategory ?? null,
          merged.countryCodes ? serializeJson(merged.countryCodes) : null,
          merged.biographySummary ?? null,
          merged.notorietyScore ?? 0,
          merged.protectionTier,
          merged.reviewStatus,
          metadata.now(),
          id,
        ),
      'creator.update',
    );
    const updated = await findById(id);
    if (!updated) throw createNotFoundError('creator', id);
    return updated;
  }

  async function count(options: Omit<CreatorListOptions, keyof Pagination> = {}): Promise<number> {
    const row = await firstRow<{ count: number }>(
      db
        .prepare(
          `SELECT COUNT(*) AS count FROM creator_entities e
           WHERE (? IS NULL
             OR e.normalized_name LIKE ? ESCAPE '\\'
             OR EXISTS (
               SELECT 1 FROM creator_aliases alias
               JOIN creator_sources alias_source ON alias_source.id = alias.source_id
               WHERE alias.creator_entity_id = e.id
                 AND alias_source.verification_status = 'verified'
                 AND alias.normalized_alias LIKE ? ESCAPE '\\'
             )
             OR EXISTS (
               SELECT 1 FROM reserved_handles handle
               WHERE handle.creator_entity_id = e.id AND handle.status = 'active'
                 AND handle.classification <> 'not_listed'
                 AND handle.normalized_handle LIKE ? ESCAPE '\\'
             )
             OR EXISTS (
               SELECT 1 FROM creator_sources source
               WHERE source.creator_entity_id = e.id AND source.verification_status = 'verified'
                 AND source.source_entity_id = ?
             )
           )
             AND (? IS NULL OR e.primary_category = ?)
             AND (? IS NULL OR EXISTS (
               SELECT 1 FROM json_each(e.country_codes) country WHERE country.value = ?
             ))
             AND (? IS NULL OR e.protection_tier = ?)
             AND (? IS NULL OR e.review_status = ?)
             AND (? IS NULL OR EXISTS (
               SELECT 1 FROM creator_sources source_filter
               WHERE source_filter.creator_entity_id = e.id
                 AND source_filter.verification_status = 'verified'
                 AND source_filter.source_name = ?
             ))`,
        )
        .bind(...createFilterBinding(options)),
      'creator.count',
    );
    return row?.count ?? 0;
  }

  return { create, findById, findPublicById, findByIds, findByNormalizedName, list, update, count };
}
