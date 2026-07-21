import type { ImportBatchStatus, ImportFormat } from '@open-creator-registry/contracts/admin';

import { createInvalidInputError, createNotFoundError, withDatabaseErrorMapping } from '../errors';
import { parseJson, serializeJson, type JsonValue } from '../json';
import type { ImportBatch, ImportBatchError, PaginatedResult, Pagination } from '../models';
import { defaultRecordMetadataProvider, type RecordMetadataProvider } from '../runtime';
import { allRows, firstRow, resolvePagination } from './shared';

type ImportBatchRow = {
  id: string;
  format: ImportFormat;
  file_name: string;
  checksum: string;
  status: ImportBatchStatus;
  total_rows: number;
  valid_rows: number;
  invalid_rows: number;
  duplicate_rows: number;
  warning_rows: number;
  validated_payload: string;
  summary: string | null;
  created_by: string;
  committed_by: string | null;
  created_at: string;
  committed_at: string | null;
  completed_at: string | null;
  updated_at: string;
};

type ImportBatchErrorRow = {
  id: string;
  import_batch_id: string;
  row_number: number;
  error_code: string;
  error_message: string;
  field_name: string | null;
  raw_value: string | null;
  created_at: string;
};

function mapBatch(row: ImportBatchRow): ImportBatch {
  return {
    id: row.id,
    format: row.format,
    fileName: row.file_name,
    checksum: row.checksum,
    status: row.status,
    totalRows: row.total_rows,
    validRows: row.valid_rows,
    invalidRows: row.invalid_rows,
    duplicateRows: row.duplicate_rows,
    warningRows: row.warning_rows,
    validatedPayload: parseJson(row.validated_payload, 'import batch validated_payload'),
    summary: row.summary ? parseJson(row.summary, 'import batch summary') : null,
    createdBy: row.created_by,
    committedBy: row.committed_by,
    createdAt: row.created_at,
    committedAt: row.committed_at,
    completedAt: row.completed_at,
    updatedAt: row.updated_at,
  };
}

function mapError(row: ImportBatchErrorRow): ImportBatchError {
  return {
    id: row.id,
    importBatchId: row.import_batch_id,
    rowNumber: row.row_number,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    fieldName: row.field_name,
    rawValue: row.raw_value,
    createdAt: row.created_at,
  };
}

export type ImportPreviewError = {
  rowNumber: number;
  errorCode: string;
  errorMessage: string;
  fieldName?: string | null;
  rawValue?: string | null;
};

export type CreateImportPreviewInput = {
  format: ImportFormat;
  fileName: string;
  checksum: string;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  duplicateRows: number;
  warningRows: number;
  validatedPayload: JsonValue;
  createdBy: string;
  errors: ImportPreviewError[];
};

export type ImportBatchListOptions = Pagination & { status?: ImportBatchStatus };

export type ValidatedImportRecord =
  | {
      recordType: 'creator';
      id: string;
      canonicalName: string;
      normalizedName: string;
      entityType: string;
      primaryCategory: string | null;
      countryCodes: string[] | null;
      biographySummary: string | null;
      notorietyScore: number;
      protectionTier: string;
      reviewStatus: string;
    }
  | {
      recordType: 'alias';
      id: string;
      creatorEntityId: string;
      alias: string;
      normalizedAlias: string;
      confusableSkeleton: string;
      language: string | null;
      aliasType: string;
      confidenceScore: number;
      sourceId: string | null;
    }
  | {
      recordType: 'source';
      id: string;
      creatorEntityId: string;
      sourceName: string;
      sourceEntityId: string;
      sourceUrl: string | null;
      sourceLicense: string | null;
      verificationStatus: string;
      lastCheckedAt: string | null;
    }
  | {
      recordType: 'handle';
      id: string;
      creatorEntityId: string;
      displayHandle: string;
      normalizedHandle: string;
      confusableSkeleton: string;
      classification: string;
      confidenceScore: number;
      decisionSource: string;
      reason: string;
      status: string;
      requiresApproval: boolean;
    };

export function createImportBatchRepository(
  db: D1Database,
  metadata: RecordMetadataProvider = defaultRecordMetadataProvider,
) {
  async function findById(id: string): Promise<ImportBatch | null> {
    const row = await firstRow<ImportBatchRow>(
      db.prepare('SELECT * FROM import_batches WHERE id = ? LIMIT 1').bind(id),
      'importBatch.findById',
    );
    return row ? mapBatch(row) : null;
  }

  async function createPreview(input: CreateImportPreviewInput): Promise<ImportBatch> {
    const existing = await firstRow<ImportBatchRow>(
      db
        .prepare('SELECT * FROM import_batches WHERE checksum = ? AND created_by = ? LIMIT 1')
        .bind(input.checksum, input.createdBy),
      'importBatch.findExistingPreview',
    );
    if (existing) return mapBatch(existing);

    const id = metadata.createId();
    const timestamp = metadata.now();
    const statements: D1PreparedStatement[] = [
      db
        .prepare(
          `INSERT INTO import_batches (
            id, format, file_name, checksum, status, total_rows, valid_rows, invalid_rows,
            duplicate_rows, warning_rows, validated_payload, summary, created_by, committed_by,
            created_at, committed_at, completed_at, updated_at
          ) VALUES (?, ?, ?, ?, 'previewed', ?, ?, ?, ?, ?, ?, NULL, ?, NULL, ?, NULL, NULL, ?)`,
        )
        .bind(
          id,
          input.format,
          input.fileName,
          input.checksum,
          input.totalRows,
          input.validRows,
          input.invalidRows,
          input.duplicateRows,
          input.warningRows,
          serializeJson(input.validatedPayload),
          input.createdBy,
          timestamp,
          timestamp,
        ),
    ];
    for (const issue of input.errors) {
      statements.push(
        db
          .prepare(
            `INSERT INTO import_batch_errors (
              id, import_batch_id, row_number, error_code, error_message, field_name, raw_value,
              created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            metadata.createId(),
            id,
            issue.rowNumber,
            issue.errorCode,
            issue.errorMessage,
            issue.fieldName ?? null,
            issue.rawValue ?? null,
            timestamp,
          ),
      );
    }
    await withDatabaseErrorMapping('importBatch.createPreview', () => db.batch(statements));
    const created = await findById(id);
    if (!created) throw createNotFoundError('import batch', id);
    return created;
  }

  async function list(options: ImportBatchListOptions = {}): Promise<PaginatedResult<ImportBatch>> {
    const { page, limit, offset } = resolvePagination(options);
    const rows = await allRows<ImportBatchRow>(
      db
        .prepare(
          `SELECT * FROM import_batches WHERE (? IS NULL OR status = ?)
           ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
        )
        .bind(options.status ?? null, options.status ?? null, limit, offset),
      'importBatch.list',
    );
    return { items: rows.map(mapBatch), page, limit };
  }

  async function count(options: Omit<ImportBatchListOptions, keyof Pagination> = {}) {
    const row = await firstRow<{ count: number }>(
      db
        .prepare('SELECT COUNT(*) AS count FROM import_batches WHERE (? IS NULL OR status = ?)')
        .bind(options.status ?? null, options.status ?? null),
      'importBatch.count',
    );
    return row?.count ?? 0;
  }

  async function listErrors(importBatchId: string): Promise<ImportBatchError[]> {
    const rows = await allRows<ImportBatchErrorRow>(
      db
        .prepare(
          `SELECT * FROM import_batch_errors WHERE import_batch_id = ? ORDER BY row_number, id`,
        )
        .bind(importBatchId),
      'importBatch.listErrors',
    );
    return rows.map(mapError);
  }

  async function commit(input: {
    importBatchId: string;
    checksum: string;
    records: ValidatedImportRecord[];
    actorIdentifier: string;
    requestId: string;
  }): Promise<ImportBatch> {
    const current = await findById(input.importBatchId);
    if (!current) throw createNotFoundError('import batch', input.importBatchId);
    if (current.checksum !== input.checksum) {
      throw createInvalidInputError('The import checksum no longer matches its preview.');
    }
    if (current.status === 'completed' || current.status === 'completed_with_warnings')
      return current;
    if (current.status !== 'previewed') {
      throw createInvalidInputError('Only a previewed import batch can be committed.');
    }
    if (current.invalidRows > 0) {
      throw createInvalidInputError(
        'Resolve every invalid import row before committing the preview.',
      );
    }

    const timestamp = metadata.now();
    const ingestionRunId = metadata.createId();
    const guardId = metadata.createId();
    const statements: D1PreparedStatement[] = [
      db
        .prepare(
          `INSERT INTO admin_mutation_guards (id, valid)
           VALUES (?, (SELECT COUNT(*) FROM import_batches
             WHERE id = ? AND checksum = ? AND status = 'previewed'))`,
        )
        .bind(guardId, input.importBatchId, input.checksum),
      db
        .prepare(
          `INSERT INTO ingestion_runs (
            id, source_name, status, imported_count, updated_count, skipped_count, failed_count,
            error_summary, started_at, completed_at, created_at, updated_at
          ) VALUES (?, ?, 'running', 0, 0, 0, 0, NULL, ?, NULL, ?, ?)`,
        )
        .bind(ingestionRunId, `admin_import:${current.fileName}`, timestamp, timestamp, timestamp),
    ];

    let importedCount = 0;
    let approvalCount = 0;
    for (const record of input.records) {
      if (record.recordType === 'creator') {
        statements.push(
          db
            .prepare(
              `INSERT OR IGNORE INTO creator_entities (
                id, canonical_name, normalized_name, entity_type, primary_category, country_codes,
                biography_summary, notoriety_score, protection_tier, review_status, created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            )
            .bind(
              record.id,
              record.canonicalName,
              record.normalizedName,
              record.entityType,
              record.primaryCategory,
              record.countryCodes ? serializeJson(record.countryCodes) : null,
              record.biographySummary,
              record.notorietyScore,
              record.protectionTier,
              record.reviewStatus,
              timestamp,
              timestamp,
            ),
        );
        importedCount += 1;
        continue;
      }
      if (record.recordType === 'alias') {
        statements.push(
          db
            .prepare(
              `INSERT OR IGNORE INTO creator_aliases (
                id, creator_entity_id, alias, normalized_alias, confusable_skeleton, language,
                alias_type, confidence_score, source_id, created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            )
            .bind(
              record.id,
              record.creatorEntityId,
              record.alias,
              record.normalizedAlias,
              record.confusableSkeleton,
              record.language,
              record.aliasType,
              record.confidenceScore,
              record.sourceId,
              timestamp,
              timestamp,
            ),
        );
        importedCount += 1;
        continue;
      }
      if (record.recordType === 'source') {
        statements.push(
          db
            .prepare(
              `INSERT OR IGNORE INTO creator_sources (
                id, creator_entity_id, source_name, source_entity_id, source_url, source_license,
                verification_status, last_checked_at, created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            )
            .bind(
              record.id,
              record.creatorEntityId,
              record.sourceName,
              record.sourceEntityId,
              record.sourceUrl,
              record.sourceLicense,
              record.verificationStatus,
              record.lastCheckedAt,
              timestamp,
              timestamp,
            ),
        );
        importedCount += 1;
        continue;
      }
      if (record.requiresApproval) {
        const approvalId = metadata.createId();
        const expiresAt = new Date(
          new Date(timestamp).getTime() + 24 * 60 * 60 * 1000,
        ).toISOString();
        statements.push(
          db
            .prepare(
              `INSERT INTO admin_approval_requests (
                id, action_type, entity_type, entity_id, requested_by, requested_payload, reason,
                status, required_approvals, approval_count, target_revision, expires_at, created_at,
                updated_at, resolved_at, applied_at
              ) VALUES (?, 'handle.create_critical', 'reserved_handle', ?, ?, ?, ?, 'pending', 1,
                0, NULL, ?, ?, ?, NULL, NULL)`,
            )
            .bind(
              approvalId,
              record.id,
              input.actorIdentifier,
              serializeJson(record),
              `Critical handle from import ${current.fileName}`,
              expiresAt,
              timestamp,
              timestamp,
            ),
        );
        statements.push(
          db
            .prepare(
              `INSERT INTO audit_logs (
              id, action, entity_type, entity_id, actor_identifier, previous_value, new_value,
              metadata, created_at
            ) VALUES (?, 'approval.requested', 'admin_approval_request', ?, ?, NULL, ?, ?, ?)`,
            )
            .bind(
              metadata.createId(),
              approvalId,
              input.actorIdentifier,
              serializeJson({
                action_type: 'handle.create_critical',
                intended_handle_id: record.id,
              }),
              serializeJson({ request_id: input.requestId, import_batch_id: current.id }),
              timestamp,
            ),
        );
        approvalCount += 1;
      } else {
        statements.push(
          db
            .prepare(
              `INSERT OR IGNORE INTO reserved_handles (
                id, creator_entity_id, display_handle, normalized_handle, confusable_skeleton,
                classification, confidence_score, decision_source, reason, status, created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            )
            .bind(
              record.id,
              record.creatorEntityId,
              record.displayHandle,
              record.normalizedHandle,
              record.confusableSkeleton,
              record.classification,
              record.confidenceScore,
              record.decisionSource,
              record.reason,
              record.status,
              timestamp,
              timestamp,
            ),
        );
        importedCount += 1;
      }
    }

    const finalStatus = approvalCount > 0 ? 'completed_with_warnings' : 'completed';
    const summary = {
      imported_count: importedCount,
      approval_request_count: approvalCount,
      invalid_count: current.invalidRows,
      duplicate_count: current.duplicateRows,
    };
    statements.push(
      db
        .prepare(
          `UPDATE ingestion_runs SET status = ?, imported_count = ?, skipped_count = ?,
           failed_count = ?, error_summary = ?, completed_at = ?, updated_at = ? WHERE id = ?`,
        )
        .bind(
          approvalCount > 0 || current.invalidRows > 0 ? 'completed_with_errors' : 'completed',
          importedCount,
          current.duplicateRows,
          current.invalidRows,
          current.invalidRows > 0 ? 'Some preview rows were invalid and were not committed.' : null,
          timestamp,
          timestamp,
          ingestionRunId,
        ),
      db
        .prepare(
          `UPDATE import_batches SET status = ?, summary = ?, committed_by = ?, committed_at = ?,
           completed_at = ?, updated_at = ? WHERE id = ? AND checksum = ? AND status = 'previewed'`,
        )
        .bind(
          finalStatus,
          serializeJson(summary),
          input.actorIdentifier,
          timestamp,
          timestamp,
          timestamp,
          input.importBatchId,
          input.checksum,
        ),
      db
        .prepare(
          `INSERT INTO audit_logs (
            id, action, entity_type, entity_id, actor_identifier, previous_value, new_value,
            metadata, created_at
          ) VALUES (?, 'import.committed', 'import_batch', ?, ?, NULL, ?, ?, ?)`,
        )
        .bind(
          metadata.createId(),
          input.importBatchId,
          input.actorIdentifier,
          serializeJson(summary),
          serializeJson({ request_id: input.requestId, checksum: input.checksum }),
          timestamp,
        ),
      db.prepare('DELETE FROM admin_mutation_guards WHERE id = ?').bind(guardId),
    );

    await withDatabaseErrorMapping('importBatch.commit', () => db.batch(statements));
    const committed = await findById(input.importBatchId);
    if (!committed) throw createNotFoundError('import batch', input.importBatchId);
    return committed;
  }

  return { createPreview, findById, list, count, listErrors, commit };
}
