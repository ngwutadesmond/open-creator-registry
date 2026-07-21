import { serializeJson, type JsonValue } from '../json';
import type { AuditLog, PaginatedResult, Pagination } from '../models';
import { defaultRecordMetadataProvider, type RecordMetadataProvider } from '../runtime';
import { mapAuditLog, type AuditLogRow } from './row-mappers';
import { allRows, firstRow, resolvePagination, runStatement } from './shared';

export type AppendAuditLogInput = {
  action: string;
  entityType: string;
  entityId?: string | null;
  actorIdentifier: string;
  previousValue?: JsonValue | null;
  newValue?: JsonValue | null;
  metadata?: JsonValue | null;
};

export type AuditLogListOptions = Pagination & {
  action?: string;
  actorIdentifier?: string;
};

export function createAuditLogRepository(
  db: D1Database,
  metadataProvider: RecordMetadataProvider = defaultRecordMetadataProvider,
) {
  async function append(input: AppendAuditLogInput): Promise<AuditLog> {
    const id = metadataProvider.createId();
    const timestamp = metadataProvider.now();
    await runStatement(
      db
        .prepare(
          `INSERT INTO audit_logs (
            id, action, entity_type, entity_id, actor_identifier, previous_value, new_value,
            metadata, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          id,
          input.action,
          input.entityType,
          input.entityId ?? null,
          input.actorIdentifier,
          input.previousValue === undefined || input.previousValue === null
            ? null
            : serializeJson(input.previousValue),
          input.newValue === undefined || input.newValue === null
            ? null
            : serializeJson(input.newValue),
          input.metadata === undefined || input.metadata === null
            ? null
            : serializeJson(input.metadata),
          timestamp,
        ),
      'auditLog.append',
    );
    const row = await firstRow<AuditLogRow>(
      db.prepare('SELECT * FROM audit_logs WHERE id = ? LIMIT 1').bind(id),
      'auditLog.findAppended',
    );
    if (!row) throw new Error('The appended audit log could not be read.');
    return mapAuditLog(row);
  }

  async function findByEntity(entityType: string, entityId: string): Promise<AuditLog[]> {
    const rows = await allRows<AuditLogRow>(
      db
        .prepare(
          `SELECT * FROM audit_logs WHERE entity_type = ? AND entity_id = ?
           ORDER BY created_at DESC, id DESC`,
        )
        .bind(entityType, entityId),
      'auditLog.findByEntity',
    );
    return rows.map(mapAuditLog);
  }

  async function list(options: AuditLogListOptions = {}): Promise<PaginatedResult<AuditLog>> {
    const { page, limit, offset } = resolvePagination(options);
    const rows = await allRows<AuditLogRow>(
      db
        .prepare(
          `SELECT * FROM audit_logs WHERE (? IS NULL OR action = ?)
           AND (? IS NULL OR actor_identifier = ?)
           ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
        )
        .bind(
          options.action ?? null,
          options.action ?? null,
          options.actorIdentifier ?? null,
          options.actorIdentifier ?? null,
          limit,
          offset,
        ),
      'auditLog.list',
    );
    return { items: rows.map(mapAuditLog), page, limit };
  }

  return { append, findByEntity, list };
}
