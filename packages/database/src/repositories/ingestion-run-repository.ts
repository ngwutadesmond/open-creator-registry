import type { IngestionStatus } from '@open-creator-registry/contracts/domain';

import { createInvalidInputError, createNotFoundError } from '../errors';
import type { IngestionRun, PaginatedResult, Pagination } from '../models';
import { defaultRecordMetadataProvider, type RecordMetadataProvider } from '../runtime';
import { mapIngestionRun, type IngestionRunRow } from './row-mappers';
import { allRows, firstRow, resolvePagination, runStatement } from './shared';

export type IngestionCounts = {
  importedCount: number;
  updatedCount: number;
  skippedCount: number;
  failedCount: number;
};

export type IngestionRunListOptions = Pagination & {
  status?: IngestionStatus;
  sourceName?: string;
};

function validateCounts(counts: IngestionCounts): void {
  if (Object.values(counts).some((count) => !Number.isInteger(count) || count < 0)) {
    throw createInvalidInputError('Ingestion counters must be non-negative integers.');
  }
}

export function createIngestionRunRepository(
  db: D1Database,
  metadata: RecordMetadataProvider = defaultRecordMetadataProvider,
) {
  async function findById(id: string): Promise<IngestionRun | null> {
    const row = await firstRow<IngestionRunRow>(
      db.prepare('SELECT * FROM ingestion_runs WHERE id = ? LIMIT 1').bind(id),
      'ingestionRun.findById',
    );
    return row ? mapIngestionRun(row) : null;
  }

  async function create(sourceName: string): Promise<IngestionRun> {
    const id = metadata.createId();
    const timestamp = metadata.now();
    await runStatement(
      db
        .prepare(
          `INSERT INTO ingestion_runs (
            id, source_name, status, imported_count, updated_count, skipped_count, failed_count,
            error_summary, started_at, completed_at, created_at, updated_at
          ) VALUES (?, ?, 'pending', 0, 0, 0, 0, NULL, ?, NULL, ?, ?)`,
        )
        .bind(id, sourceName, timestamp, timestamp, timestamp),
      'ingestionRun.create',
    );
    const created = await findById(id);
    if (!created) throw createNotFoundError('ingestion run', id);
    return created;
  }

  async function updateStatus(
    id: string,
    status: IngestionStatus,
    counts: IngestionCounts,
    errorSummary: string | null,
    completedAt: string | null,
  ): Promise<IngestionRun> {
    validateCounts(counts);
    const result = await runStatement(
      db
        .prepare(
          `UPDATE ingestion_runs SET status = ?, imported_count = ?, updated_count = ?,
           skipped_count = ?, failed_count = ?, error_summary = ?, completed_at = ?, updated_at = ?
           WHERE id = ?`,
        )
        .bind(
          status,
          counts.importedCount,
          counts.updatedCount,
          counts.skippedCount,
          counts.failedCount,
          errorSummary,
          completedAt,
          metadata.now(),
          id,
        ),
      `ingestionRun.${status}`,
    );
    if ((result.meta.changes ?? 0) === 0) throw createNotFoundError('ingestion run', id);
    const updated = await findById(id);
    if (!updated) throw createNotFoundError('ingestion run', id);
    return updated;
  }

  async function markRunning(id: string): Promise<IngestionRun> {
    const current = await findById(id);
    if (!current) throw createNotFoundError('ingestion run', id);
    return updateStatus(
      id,
      'running',
      {
        importedCount: current.importedCount,
        updatedCount: current.updatedCount,
        skippedCount: current.skippedCount,
        failedCount: current.failedCount,
      },
      null,
      null,
    );
  }

  async function markCompleted(
    id: string,
    counts: IngestionCounts,
    errorSummary: string | null = null,
  ): Promise<IngestionRun> {
    return updateStatus(
      id,
      counts.failedCount > 0 ? 'completed_with_errors' : 'completed',
      counts,
      errorSummary,
      metadata.now(),
    );
  }

  async function markFailed(id: string, errorSummary: string): Promise<IngestionRun> {
    const current = await findById(id);
    if (!current) throw createNotFoundError('ingestion run', id);
    return updateStatus(
      id,
      'failed',
      {
        importedCount: current.importedCount,
        updatedCount: current.updatedCount,
        skippedCount: current.skippedCount,
        failedCount: current.failedCount,
      },
      errorSummary,
      metadata.now(),
    );
  }

  async function list(
    options: IngestionRunListOptions = {},
  ): Promise<PaginatedResult<IngestionRun>> {
    const { page, limit, offset } = resolvePagination(options);
    const rows = await allRows<IngestionRunRow>(
      db
        .prepare(
          `SELECT * FROM ingestion_runs WHERE (? IS NULL OR status = ?)
           AND (? IS NULL OR source_name = ?)
           ORDER BY started_at DESC, id DESC LIMIT ? OFFSET ?`,
        )
        .bind(
          options.status ?? null,
          options.status ?? null,
          options.sourceName ?? null,
          options.sourceName ?? null,
          limit,
          offset,
        ),
      'ingestionRun.list',
    );
    return { items: rows.map(mapIngestionRun), page, limit };
  }

  async function count(options: Omit<IngestionRunListOptions, keyof Pagination> = {}) {
    const row = await firstRow<{ count: number }>(
      db
        .prepare(
          `SELECT COUNT(*) AS count FROM ingestion_runs
           WHERE (? IS NULL OR status = ?) AND (? IS NULL OR source_name = ?)`,
        )
        .bind(
          options.status ?? null,
          options.status ?? null,
          options.sourceName ?? null,
          options.sourceName ?? null,
        ),
      'ingestionRun.count',
    );
    return row?.count ?? 0;
  }

  return { create, markRunning, markCompleted, markFailed, findById, list, count };
}
