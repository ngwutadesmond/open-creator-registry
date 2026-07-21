import type { SourceVerificationStatus } from '@open-creator-registry/contracts/domain';

import { createNotFoundError } from '../errors';
import type { CreatorSource } from '../models';
import { defaultRecordMetadataProvider, type RecordMetadataProvider } from '../runtime';
import { mapCreatorSource, type CreatorSourceRow } from './row-mappers';
import { allRows, firstRow, runStatement } from './shared';

export type CreateCreatorSourceInput = {
  creatorEntityId: string;
  sourceName: string;
  sourceEntityId: string;
  sourceUrl?: string | null;
  sourceLicense?: string | null;
  verificationStatus: SourceVerificationStatus;
  lastCheckedAt?: string | null;
};

export type UpdateCreatorSourceInput = Partial<
  Pick<
    CreateCreatorSourceInput,
    'sourceUrl' | 'sourceLicense' | 'verificationStatus' | 'lastCheckedAt'
  >
>;

export function createCreatorSourceRepository(
  db: D1Database,
  metadata: RecordMetadataProvider = defaultRecordMetadataProvider,
) {
  async function findById(id: string): Promise<CreatorSource | null> {
    const row = await firstRow<CreatorSourceRow>(
      db.prepare('SELECT * FROM creator_sources WHERE id = ? LIMIT 1').bind(id),
      'creatorSource.findById',
    );
    return row ? mapCreatorSource(row) : null;
  }

  async function create(input: CreateCreatorSourceInput): Promise<CreatorSource> {
    const id = metadata.createId();
    const timestamp = metadata.now();
    await runStatement(
      db
        .prepare(
          `INSERT INTO creator_sources (
            id, creator_entity_id, source_name, source_entity_id, source_url, source_license,
            verification_status, last_checked_at, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          id,
          input.creatorEntityId,
          input.sourceName,
          input.sourceEntityId,
          input.sourceUrl ?? null,
          input.sourceLicense ?? null,
          input.verificationStatus,
          input.lastCheckedAt ?? null,
          timestamp,
          timestamp,
        ),
      'creatorSource.create',
    );
    const created = await findById(id);
    if (!created) throw createNotFoundError('creator source', id);
    return created;
  }

  async function listByCreator(creatorEntityId: string): Promise<CreatorSource[]> {
    const rows = await allRows<CreatorSourceRow>(
      db
        .prepare(
          'SELECT * FROM creator_sources WHERE creator_entity_id = ? ORDER BY created_at, id',
        )
        .bind(creatorEntityId),
      'creatorSource.listByCreator',
    );
    return rows.map(mapCreatorSource);
  }

  async function listVerifiedByCreator(creatorEntityId: string): Promise<CreatorSource[]> {
    const rows = await allRows<CreatorSourceRow>(
      db
        .prepare(
          `SELECT * FROM creator_sources
           WHERE creator_entity_id = ? AND verification_status = 'verified'
           ORDER BY created_at, id`,
        )
        .bind(creatorEntityId),
      'creatorSource.listVerifiedByCreator',
    );
    return rows.map(mapCreatorSource);
  }

  async function findByExternalIdentity(
    sourceName: string,
    sourceEntityId: string,
  ): Promise<CreatorSource | null> {
    const row = await firstRow<CreatorSourceRow>(
      db
        .prepare(
          `SELECT * FROM creator_sources WHERE source_name = ? AND source_entity_id = ? LIMIT 1`,
        )
        .bind(sourceName, sourceEntityId),
      'creatorSource.findByExternalIdentity',
    );
    return row ? mapCreatorSource(row) : null;
  }

  async function update(id: string, input: UpdateCreatorSourceInput): Promise<CreatorSource> {
    const current = await findById(id);
    if (!current) throw createNotFoundError('creator source', id);
    await runStatement(
      db
        .prepare(
          `UPDATE creator_sources SET source_url = ?, source_license = ?, verification_status = ?,
           last_checked_at = ?, updated_at = ? WHERE id = ?`,
        )
        .bind(
          input.sourceUrl === undefined ? current.sourceUrl : input.sourceUrl,
          input.sourceLicense === undefined ? current.sourceLicense : input.sourceLicense,
          input.verificationStatus ?? current.verificationStatus,
          input.lastCheckedAt === undefined ? current.lastCheckedAt : input.lastCheckedAt,
          metadata.now(),
          id,
        ),
      'creatorSource.update',
    );
    const updated = await findById(id);
    if (!updated) throw createNotFoundError('creator source', id);
    return updated;
  }

  async function deleteSource(id: string): Promise<void> {
    const result = await runStatement(
      db.prepare('DELETE FROM creator_sources WHERE id = ?').bind(id),
      'creatorSource.delete',
    );
    if ((result.meta.changes ?? 0) === 0) throw createNotFoundError('creator source', id);
  }

  return {
    create,
    findById,
    findByExternalIdentity,
    listByCreator,
    listVerifiedByCreator,
    update,
    delete: deleteSource,
  };
}
