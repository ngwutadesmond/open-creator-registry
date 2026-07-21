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
  entityType?: string;
  entityId?: string;
  createdFrom?: string;
  createdTo?: string;
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

  async function findById(id: string): Promise<AuditLog | null> {
    const row = await firstRow<AuditLogRow>(
      db.prepare('SELECT * FROM audit_logs WHERE id = ? LIMIT 1').bind(id),
      'auditLog.findById',
    );
    return row ? mapAuditLog(row) : null;
  }

  async function list(options: AuditLogListOptions = {}): Promise<PaginatedResult<AuditLog>> {
    const { page, limit, offset } = resolvePagination(options);
    const rows = await allRows<AuditLogRow>(
      db
        .prepare(
          `SELECT * FROM audit_logs WHERE (? IS NULL OR action = ?)
           AND (? IS NULL OR actor_identifier = ?)
           AND (? IS NULL OR entity_type = ?)
           AND (? IS NULL OR entity_id = ?)
           AND (? IS NULL OR created_at >= ?)
           AND (? IS NULL OR created_at <= ?)
           ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
        )
        .bind(
          options.action ?? null,
          options.action ?? null,
          options.actorIdentifier ?? null,
          options.actorIdentifier ?? null,
          options.entityType ?? null,
          options.entityType ?? null,
          options.entityId ?? null,
          options.entityId ?? null,
          options.createdFrom ?? null,
          options.createdFrom ?? null,
          options.createdTo ?? null,
          options.createdTo ?? null,
          limit,
          offset,
        ),
      'auditLog.list',
    );
    return { items: rows.map(mapAuditLog), page, limit };
  }

  async function count(options: Omit<AuditLogListOptions, keyof Pagination> = {}): Promise<number> {
    const row = await firstRow<{ count: number }>(
      db
        .prepare(
          `SELECT COUNT(*) AS count FROM audit_logs WHERE (? IS NULL OR action = ?)
         AND (? IS NULL OR actor_identifier = ?)
         AND (? IS NULL OR entity_type = ?)
         AND (? IS NULL OR entity_id = ?)
         AND (? IS NULL OR created_at >= ?)
         AND (? IS NULL OR created_at <= ?)`,
        )
        .bind(
          options.action ?? null,
          options.action ?? null,
          options.actorIdentifier ?? null,
          options.actorIdentifier ?? null,
          options.entityType ?? null,
          options.entityType ?? null,
          options.entityId ?? null,
          options.entityId ?? null,
          options.createdFrom ?? null,
          options.createdFrom ?? null,
          options.createdTo ?? null,
          options.createdTo ?? null,
        ),
      'auditLog.count',
    );
    return row?.count ?? 0;
  }

  return { append, findById, findByEntity, list, count };
}
