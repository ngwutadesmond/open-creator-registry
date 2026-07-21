import type { IngestionOutcomeStatus } from '@open-creator-registry/contracts/sources';

import { parseJson, serializeJson, type JsonValue } from '../json';
import type { IngestionRecordOutcome, PaginatedResult, Pagination } from '../models';
import { defaultRecordMetadataProvider, type RecordMetadataProvider } from '../runtime';
import { allRows, firstRow, resolvePagination, runStatement } from './shared';

type OutcomeRow = {
  id: string;
  ingestion_run_id: string;
  source_record_id: string | null;
  idempotency_key: string;
  outcome_status: IngestionOutcomeStatus;
  candidate_id: string | null;
  retry_count: number;
  error_code: string | null;
  error_message: string | null;
  metadata: string | null;
  created_at: string;
};

function mapOutcome(row: OutcomeRow): IngestionRecordOutcome {
  return {
    id: row.id,
    ingestionRunId: row.ingestion_run_id,
    sourceRecordId: row.source_record_id,
    idempotencyKey: row.idempotency_key,
    outcomeStatus: row.outcome_status,
    candidateId: row.candidate_id,
    retryCount: row.retry_count,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    metadata: row.metadata ? parseJson(row.metadata, 'ingestion record outcome metadata') : null,
    createdAt: row.created_at,
  };
}

export function createIngestionRecordOutcomeRepository(
  db: D1Database,
  recordMetadata: RecordMetadataProvider = defaultRecordMetadataProvider,
) {
  async function append(input: {
    ingestionRunId: string;
    sourceRecordId?: string | null;
    idempotencyKey: string;
    outcomeStatus: IngestionOutcomeStatus;
    candidateId?: string | null;
    retryCount?: number;
    errorCode?: string | null;
    errorMessage?: string | null;
    metadata?: JsonValue | null;
  }): Promise<void> {
    await runStatement(
      db
        .prepare(
          `INSERT OR IGNORE INTO ingestion_record_outcomes (
            id, ingestion_run_id, source_record_id, idempotency_key, outcome_status, candidate_id,
            retry_count, error_code, error_message, metadata, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          recordMetadata.createId(),
          input.ingestionRunId,
          input.sourceRecordId ?? null,
          input.idempotencyKey,
          input.outcomeStatus,
          input.candidateId ?? null,
          input.retryCount ?? 0,
          input.errorCode ?? null,
          input.errorMessage?.slice(0, 1000) ?? null,
          input.metadata == null ? null : serializeJson(input.metadata),
          recordMetadata.now(),
        ),
      'ingestionOutcome.append',
    );
  }

  async function listByRun(
    ingestionRunId: string,
    pagination: Pagination = {},
  ): Promise<PaginatedResult<IngestionRecordOutcome>> {
    const { page, limit, offset } = resolvePagination(pagination);
    const rows = await allRows<OutcomeRow>(
      db
        .prepare(
          `SELECT * FROM ingestion_record_outcomes WHERE ingestion_run_id = ?
           ORDER BY created_at, id LIMIT ? OFFSET ?`,
        )
        .bind(ingestionRunId, limit, offset),
      'ingestionOutcome.listByRun',
    );
    return { items: rows.map(mapOutcome), page, limit };
  }

  async function countByRun(ingestionRunId: string): Promise<number> {
    return (
      (
        await firstRow<{ count: number }>(
          db
            .prepare(
              'SELECT COUNT(*) AS count FROM ingestion_record_outcomes WHERE ingestion_run_id = ?',
            )
            .bind(ingestionRunId),
          'ingestionOutcome.countByRun',
        )
      )?.count ?? 0
    );
  }

  return { append, listByRun, countByRun };
}
