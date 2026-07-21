import type { RegistryClassification } from '@open-creator-registry/contracts/classifications';
import type { ReservationStatus } from '@open-creator-registry/contracts/domain';
import { createConfusableSkeleton, normalizeHandle } from '@open-creator-registry/normalization';

import { createNotFoundError } from '../errors';
import type { PaginatedResult, Pagination, ReservedHandle } from '../models';
import { defaultRecordMetadataProvider, type RecordMetadataProvider } from '../runtime';
import { mapReservedHandle, type ReservedHandleRow } from './row-mappers';
import { allRows, firstRow, resolvePagination, runStatement } from './shared';

export type CreateReservedHandleInput = {
  creatorEntityId: string;
  displayHandle: string;
  classification: RegistryClassification;
  confidenceScore: number;
  decisionSource: string;
  reason: string;
  status?: ReservationStatus;
};

export type ReservedHandleListOptions = Pagination & {
  classification?: RegistryClassification;
  status?: ReservationStatus;
};

export function createReservedHandleRepository(
  db: D1Database,
  metadata: RecordMetadataProvider = defaultRecordMetadataProvider,
) {
  async function findById(id: string): Promise<ReservedHandle | null> {
    const row = await firstRow<ReservedHandleRow>(
      db.prepare('SELECT * FROM reserved_handles WHERE id = ? LIMIT 1').bind(id),
      'reservedHandle.findById',
    );
    return row ? mapReservedHandle(row) : null;
  }

  async function create(input: CreateReservedHandleInput): Promise<ReservedHandle> {
    const id = metadata.createId();
    const timestamp = metadata.now();
    const normalizedHandle = normalizeHandle(input.displayHandle);
    await runStatement(
      db
        .prepare(
          `INSERT INTO reserved_handles (
            id, creator_entity_id, display_handle, normalized_handle, confusable_skeleton,
            classification, confidence_score, decision_source, reason, status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          id,
          input.creatorEntityId,
          input.displayHandle.trim(),
          normalizedHandle,
          createConfusableSkeleton(normalizedHandle),
          input.classification,
          input.confidenceScore,
          input.decisionSource,
          input.reason,
          input.status ?? 'active',
          timestamp,
          timestamp,
        ),
      'reservedHandle.create',
    );
    const created = await findById(id);
    if (!created) throw createNotFoundError('reserved handle', id);
    return created;
  }

  async function findExact(handle: string): Promise<ReservedHandle | null> {
    const row = await firstRow<ReservedHandleRow>(
      db
        .prepare('SELECT * FROM reserved_handles WHERE normalized_handle = ? LIMIT 1')
        .bind(normalizeHandle(handle)),
      'reservedHandle.findExact',
    );
    return row ? mapReservedHandle(row) : null;
  }

  async function findByConfusableSkeleton(handleOrSkeleton: string): Promise<ReservedHandle[]> {
    const skeleton = createConfusableSkeleton(handleOrSkeleton);
    const rows = await allRows<ReservedHandleRow>(
      db
        .prepare(
          'SELECT * FROM reserved_handles WHERE confusable_skeleton = ? ORDER BY created_at, id',
        )
        .bind(skeleton),
      'reservedHandle.findByConfusableSkeleton',
    );
    return rows.map(mapReservedHandle);
  }

  async function listByCreator(creatorEntityId: string): Promise<ReservedHandle[]> {
    const rows = await allRows<ReservedHandleRow>(
      db
        .prepare(
          'SELECT * FROM reserved_handles WHERE creator_entity_id = ? ORDER BY created_at, id',
        )
        .bind(creatorEntityId),
      'reservedHandle.listByCreator',
    );
    return rows.map(mapReservedHandle);
  }

  async function list(
    options: ReservedHandleListOptions = {},
  ): Promise<PaginatedResult<ReservedHandle>> {
    const { page, limit, offset } = resolvePagination(options);
    const rows = await allRows<ReservedHandleRow>(
      db
        .prepare(
          `SELECT * FROM reserved_handles
           WHERE (? IS NULL OR classification = ?) AND (? IS NULL OR status = ?)
           ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
        )
        .bind(
          options.classification ?? null,
          options.classification ?? null,
          options.status ?? null,
          options.status ?? null,
          limit,
          offset,
        ),
      'reservedHandle.list',
    );
    return { items: rows.map(mapReservedHandle), page, limit };
  }

  async function updateStatus(id: string, status: ReservationStatus): Promise<ReservedHandle> {
    const result = await runStatement(
      db
        .prepare('UPDATE reserved_handles SET status = ?, updated_at = ? WHERE id = ?')
        .bind(status, metadata.now(), id),
      'reservedHandle.updateStatus',
    );
    if ((result.meta.changes ?? 0) === 0) throw createNotFoundError('reserved handle', id);
    const updated = await findById(id);
    if (!updated) throw createNotFoundError('reserved handle', id);
    return updated;
  }

  async function count(
    options: Omit<ReservedHandleListOptions, keyof Pagination> = {},
  ): Promise<number> {
    const row = await firstRow<{ count: number }>(
      db
        .prepare(
          `SELECT COUNT(*) AS count FROM reserved_handles
           WHERE (? IS NULL OR classification = ?) AND (? IS NULL OR status = ?)`,
        )
        .bind(
          options.classification ?? null,
          options.classification ?? null,
          options.status ?? null,
          options.status ?? null,
        ),
      'reservedHandle.count',
    );
    return row?.count ?? 0;
  }

  return {
    create,
    findById,
    findExact,
    findByConfusableSkeleton,
    listByCreator,
    list,
    updateStatus,
    count,
  };
}
