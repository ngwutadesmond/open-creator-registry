import { serializeJson, parseJson, type JsonValue } from '../json';
import type { SourceCheckpoint } from '../models';
import { defaultRecordMetadataProvider, type RecordMetadataProvider } from '../runtime';
import { allRows, firstRow, runStatement } from './shared';

type SourceCheckpointRow = {
  id: string;
  source_name: string;
  scope_key: string;
  connector_version: string;
  cursor: string | null;
  last_source_record_id: string | null;
  last_attempt_at: string | null;
  last_success_at: string | null;
  consecutive_failure_count: number;
  next_allowed_attempt_at: string | null;
  metadata: string | null;
  created_at: string;
  updated_at: string;
};

function mapCheckpoint(row: SourceCheckpointRow): SourceCheckpoint {
  return {
    id: row.id,
    sourceName: row.source_name,
    scopeKey: row.scope_key,
    connectorVersion: row.connector_version,
    cursor: row.cursor,
    lastSourceRecordId: row.last_source_record_id,
    lastAttemptAt: row.last_attempt_at,
    lastSuccessAt: row.last_success_at,
    consecutiveFailureCount: row.consecutive_failure_count,
    nextAllowedAttemptAt: row.next_allowed_attempt_at,
    metadata: row.metadata ? parseJson(row.metadata, 'source checkpoint metadata') : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createSourceCheckpointRepository(
  db: D1Database,
  recordMetadata: RecordMetadataProvider = defaultRecordMetadataProvider,
) {
  async function findById(id: string): Promise<SourceCheckpoint | null> {
    const row = await firstRow<SourceCheckpointRow>(
      db.prepare('SELECT * FROM source_checkpoints WHERE id = ? LIMIT 1').bind(id),
      'sourceCheckpoint.findById',
    );
    return row ? mapCheckpoint(row) : null;
  }

  async function findBySourceScope(sourceName: string, scopeKey: string) {
    const row = await firstRow<SourceCheckpointRow>(
      db
        .prepare('SELECT * FROM source_checkpoints WHERE source_name = ? AND scope_key = ? LIMIT 1')
        .bind(sourceName, scopeKey),
      'sourceCheckpoint.findBySourceScope',
    );
    return row ? mapCheckpoint(row) : null;
  }

  async function recordSuccess(input: {
    sourceName: string;
    scopeKey: string;
    connectorVersion: string;
    cursor: string | null;
    lastSourceRecordId: string | null;
    metadata?: JsonValue | null;
  }): Promise<SourceCheckpoint> {
    const existing = await findBySourceScope(input.sourceName, input.scopeKey);
    const id = existing?.id ?? recordMetadata.createId();
    const timestamp = recordMetadata.now();
    await runStatement(
      db
        .prepare(
          `INSERT INTO source_checkpoints (
            id, source_name, scope_key, connector_version, cursor, last_source_record_id,
            last_attempt_at, last_success_at, consecutive_failure_count, next_allowed_attempt_at,
            metadata, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, ?, ?, ?)
          ON CONFLICT(source_name, scope_key) DO UPDATE SET
            connector_version = excluded.connector_version, cursor = excluded.cursor,
            last_source_record_id = excluded.last_source_record_id,
            last_attempt_at = excluded.last_attempt_at, last_success_at = excluded.last_success_at,
            consecutive_failure_count = 0, next_allowed_attempt_at = NULL,
            metadata = excluded.metadata, updated_at = excluded.updated_at`,
        )
        .bind(
          id,
          input.sourceName,
          input.scopeKey,
          input.connectorVersion,
          input.cursor,
          input.lastSourceRecordId,
          timestamp,
          timestamp,
          input.metadata == null ? null : serializeJson(input.metadata),
          timestamp,
          timestamp,
        ),
      'sourceCheckpoint.recordSuccess',
    );
    const saved = await findBySourceScope(input.sourceName, input.scopeKey);
    if (!saved) throw new Error('The source checkpoint could not be read after success.');
    return saved;
  }

  async function recordFailure(input: {
    sourceName: string;
    scopeKey: string;
    connectorVersion: string;
    nextAllowedAttemptAt: string | null;
    metadata?: JsonValue | null;
  }): Promise<SourceCheckpoint> {
    const existing = await findBySourceScope(input.sourceName, input.scopeKey);
    const id = existing?.id ?? recordMetadata.createId();
    const timestamp = recordMetadata.now();
    await runStatement(
      db
        .prepare(
          `INSERT INTO source_checkpoints (
            id, source_name, scope_key, connector_version, cursor, last_source_record_id,
            last_attempt_at, last_success_at, consecutive_failure_count, next_allowed_attempt_at,
            metadata, created_at, updated_at
          ) VALUES (?, ?, ?, ?, NULL, NULL, ?, NULL, 1, ?, ?, ?, ?)
          ON CONFLICT(source_name, scope_key) DO UPDATE SET
            last_attempt_at = excluded.last_attempt_at,
            consecutive_failure_count = source_checkpoints.consecutive_failure_count + 1,
            next_allowed_attempt_at = excluded.next_allowed_attempt_at,
            metadata = excluded.metadata, updated_at = excluded.updated_at`,
        )
        .bind(
          id,
          input.sourceName,
          input.scopeKey,
          input.connectorVersion,
          timestamp,
          input.nextAllowedAttemptAt,
          input.metadata == null ? null : serializeJson(input.metadata),
          timestamp,
          timestamp,
        ),
      'sourceCheckpoint.recordFailure',
    );
    const saved = await findBySourceScope(input.sourceName, input.scopeKey);
    if (!saved) throw new Error('The source checkpoint could not be read after failure.');
    return saved;
  }

  async function list(): Promise<SourceCheckpoint[]> {
    const rows = await allRows<SourceCheckpointRow>(
      db.prepare('SELECT * FROM source_checkpoints ORDER BY source_name, scope_key'),
      'sourceCheckpoint.list',
    );
    return rows.map(mapCheckpoint);
  }

  async function reset(id: string, connectorVersion: string): Promise<SourceCheckpoint | null> {
    const timestamp = recordMetadata.now();
    const result = await runStatement(
      db
        .prepare(
          `UPDATE source_checkpoints SET connector_version = ?, cursor = NULL,
           last_source_record_id = NULL, last_attempt_at = NULL, last_success_at = NULL,
           consecutive_failure_count = 0, next_allowed_attempt_at = NULL, metadata = NULL,
           updated_at = ? WHERE id = ?`,
        )
        .bind(connectorVersion, timestamp, id),
      'sourceCheckpoint.reset',
    );
    return (result.meta.changes ?? 0) === 0 ? null : findById(id);
  }

  return { findById, findBySourceScope, recordSuccess, recordFailure, list, reset };
}
