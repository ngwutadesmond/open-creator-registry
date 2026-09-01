import type { AliasType } from '@open-creator-registry/contracts/domain';
import {
  createAliasConfusableSkeleton,
  normalizeAlias,
  normalizeHandle,
} from '@open-creator-registry/normalization';

import { createNotFoundError } from '../errors';
import { serializeJson } from '../json';
import type { CreatorAlias, PaginatedResult, Pagination } from '../models';
import { defaultRecordMetadataProvider, type RecordMetadataProvider } from '../runtime';
import { mapCreatorAlias, type CreatorAliasRow } from './row-mappers';
import { allRows, firstRow, resolvePagination, runStatement } from './shared';

export type CreateCreatorAliasInput = {
  creatorEntityId: string;
  alias: string;
  language?: string | null;
  aliasType: AliasType;
  confidenceScore: number;
  sourceId?: string | null;
};

export type UpdateCreatorAliasInput = Partial<
  Pick<CreateCreatorAliasInput, 'alias' | 'language' | 'aliasType' | 'confidenceScore' | 'sourceId'>
>;

function normalizeCreatorAlias(alias: string, aliasType: AliasType): string {
  return aliasType === 'official_handle' || aliasType === 'protected_variant'
    ? normalizeHandle(alias)
    : normalizeAlias(alias);
}

export function createCreatorAliasRepository(
  db: D1Database,
  metadata: RecordMetadataProvider = defaultRecordMetadataProvider,
) {
  async function findById(id: string): Promise<CreatorAlias | null> {
    const row = await firstRow<CreatorAliasRow>(
      db.prepare('SELECT * FROM creator_aliases WHERE id = ? LIMIT 1').bind(id),
      'creatorAlias.findById',
    );
    return row ? mapCreatorAlias(row) : null;
  }

  async function create(input: CreateCreatorAliasInput): Promise<CreatorAlias> {
    const id = metadata.createId();
    const timestamp = metadata.now();
    const normalizedAlias = normalizeCreatorAlias(input.alias, input.aliasType);
    await runStatement(
      db
        .prepare(
          `INSERT INTO creator_aliases (
            id, creator_entity_id, alias, normalized_alias, confusable_skeleton, language,
            alias_type, confidence_score, source_id, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          id,
          input.creatorEntityId,
          input.alias.trim(),
          normalizedAlias,
          createAliasConfusableSkeleton(normalizedAlias),
          input.language ?? null,
          input.aliasType,
          input.confidenceScore,
          input.sourceId ?? null,
          timestamp,
          timestamp,
        ),
      'creatorAlias.create',
    );
    const created = await findById(id);
    if (!created) throw createNotFoundError('creator alias', id);
    return created;
  }

  async function listByCreator(creatorEntityId: string): Promise<CreatorAlias[]> {
    const rows = await allRows<CreatorAliasRow>(
      db
        .prepare(
          'SELECT * FROM creator_aliases WHERE creator_entity_id = ? ORDER BY created_at, id',
        )
        .bind(creatorEntityId),
      'creatorAlias.listByCreator',
    );
    return rows.map(mapCreatorAlias);
  }

  async function findByNormalizedAlias(alias: string): Promise<CreatorAlias[]> {
    const rows = await allRows<CreatorAliasRow>(
      db
        .prepare('SELECT * FROM creator_aliases WHERE normalized_alias = ? ORDER BY created_at, id')
        .bind(normalizeAlias(alias)),
      'creatorAlias.findByNormalizedAlias',
    );
    return rows.map(mapCreatorAlias);
  }

  async function update(id: string, input: UpdateCreatorAliasInput): Promise<CreatorAlias> {
    const current = await findById(id);
    if (!current) throw createNotFoundError('creator alias', id);
    const alias = input.alias ?? current.alias;
    const aliasType = input.aliasType ?? current.aliasType;
    const normalizedAlias = normalizeCreatorAlias(alias, aliasType);
    await runStatement(
      db
        .prepare(
          `UPDATE creator_aliases SET alias = ?, normalized_alias = ?, confusable_skeleton = ?,
           language = ?, alias_type = ?, confidence_score = ?, source_id = ?, updated_at = ?
           WHERE id = ?`,
        )
        .bind(
          alias.trim(),
          normalizedAlias,
          createAliasConfusableSkeleton(normalizedAlias),
          input.language === undefined ? current.language : input.language,
          aliasType,
          input.confidenceScore ?? current.confidenceScore,
          input.sourceId === undefined ? current.sourceId : input.sourceId,
          metadata.now(),
          id,
        ),
      'creatorAlias.update',
    );
    const updated = await findById(id);
    if (!updated) throw createNotFoundError('creator alias', id);
    return updated;
  }

  async function findProtectionCandidates(handles: string[]): Promise<CreatorAlias[]> {
    if (handles.length === 0) return [];
    const normalizedHandles = [...new Set(handles.map((handle) => normalizeAlias(handle)))];
    const skeletons = [...new Set(normalizedHandles.map(createAliasConfusableSkeleton))];
    const rows = await allRows<CreatorAliasRow>(
      db
        .prepare(
          `SELECT alias.* FROM creator_aliases alias
           JOIN creator_sources source ON source.id = alias.source_id
           JOIN creator_entities creator ON creator.id = alias.creator_entity_id
           WHERE source.verification_status = 'verified'
             AND creator.review_status = 'approved'
             AND (
               alias.normalized_alias IN (SELECT value FROM json_each(?))
               OR alias.confusable_skeleton IN (SELECT value FROM json_each(?))
             )
           ORDER BY alias.created_at, alias.id`,
        )
        .bind(serializeJson(normalizedHandles), serializeJson(skeletons)),
      'creatorAlias.findProtectionCandidates',
    );
    return rows.map(mapCreatorAlias);
  }

  async function listPublicByCreator(
    creatorEntityId: string,
    pagination: Pagination = {},
  ): Promise<PaginatedResult<CreatorAlias>> {
    const { page, limit, offset } = resolvePagination(pagination);
    const rows = await allRows<CreatorAliasRow>(
      db
        .prepare(
          `SELECT alias.* FROM creator_aliases alias
           JOIN creator_sources source ON source.id = alias.source_id
           WHERE alias.creator_entity_id = ? AND source.verification_status = 'verified'
           ORDER BY alias.created_at, alias.id LIMIT ? OFFSET ?`,
        )
        .bind(creatorEntityId, limit, offset),
      'creatorAlias.listPublicByCreator',
    );
    return { items: rows.map(mapCreatorAlias), page, limit };
  }

  async function countPublicByCreator(creatorEntityId: string): Promise<number> {
    const row = await firstRow<{ count: number }>(
      db
        .prepare(
          `SELECT COUNT(*) AS count FROM creator_aliases alias
           JOIN creator_sources source ON source.id = alias.source_id
           WHERE alias.creator_entity_id = ? AND source.verification_status = 'verified'`,
        )
        .bind(creatorEntityId),
      'creatorAlias.countPublicByCreator',
    );
    return row?.count ?? 0;
  }

  async function deleteAlias(id: string): Promise<void> {
    const result = await runStatement(
      db.prepare('DELETE FROM creator_aliases WHERE id = ?').bind(id),
      'creatorAlias.delete',
    );
    if ((result.meta.changes ?? 0) === 0) throw createNotFoundError('creator alias', id);
  }

  return {
    create,
    findById,
    listByCreator,
    findByNormalizedAlias,
    findProtectionCandidates,
    listPublicByCreator,
    countPublicByCreator,
    update,
    delete: deleteAlias,
  };
}
