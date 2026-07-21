import type { AliasType } from '@open-creator-registry/contracts/domain';
import { createConfusableSkeleton, normalizeHandle } from '@open-creator-registry/normalization';

import { createNotFoundError } from '../errors';
import type { CreatorAlias } from '../models';
import { defaultRecordMetadataProvider, type RecordMetadataProvider } from '../runtime';
import { mapCreatorAlias, type CreatorAliasRow } from './row-mappers';
import { allRows, firstRow, runStatement } from './shared';

export type CreateCreatorAliasInput = {
  creatorEntityId: string;
  alias: string;
  language?: string | null;
  aliasType: AliasType;
  confidenceScore: number;
  sourceId?: string | null;
};

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
    const normalizedAlias = normalizeHandle(input.alias);
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
          createConfusableSkeleton(normalizedAlias),
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
        .bind(normalizeHandle(alias)),
      'creatorAlias.findByNormalizedAlias',
    );
    return rows.map(mapCreatorAlias);
  }

  async function deleteAlias(id: string): Promise<void> {
    const result = await runStatement(
      db.prepare('DELETE FROM creator_aliases WHERE id = ?').bind(id),
      'creatorAlias.delete',
    );
    if ((result.meta.changes ?? 0) === 0) throw createNotFoundError('creator alias', id);
  }

  return { create, findById, listByCreator, findByNormalizedAlias, delete: deleteAlias };
}
