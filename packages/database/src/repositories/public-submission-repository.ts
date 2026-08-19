import type { SubmissionStatus } from '@open-creator-registry/contracts/domain';
import { normalizeCreatorName, normalizeHandle } from '@open-creator-registry/normalization';

import { createNotFoundError, withDatabaseErrorMapping } from '../errors';
import { serializeJson } from '../json';
import type {
  PaginatedResult,
  Pagination,
  PublicSubmission,
  PublicSubmissionBatch,
} from '../models';
import { defaultRecordMetadataProvider, type RecordMetadataProvider } from '../runtime';
import { mapPublicSubmission, type PublicSubmissionRow } from './row-mappers';
import { allRows, firstRow, resolvePagination, runStatement } from './shared';

export type CreatePublicSubmissionInput = {
  id?: string;
  creatorName: string;
  normalizedCreatorName?: string | null;
  category?: string | null;
  countryCodes?: string[] | null;
  requestedHandles: string[];
  publicSources: string[];
  submissionFingerprint?: string | null;
  batchReference?: string | null;
  batchRowNumber?: number | null;
  submissionStatus?: SubmissionStatus;
  createdAt?: string;
};

export type CommitPublicSubmissionBatchInput = {
  id: string;
  previewChecksum: string;
  resultJson: string;
  createdAt: string;
  submissions: CreatePublicSubmissionInput[];
};

export type PublicSubmissionListOptions = Pagination & {
  submissionStatus?: SubmissionStatus;
};

export function createPublicSubmissionRepository(
  db: D1Database,
  metadata: RecordMetadataProvider = defaultRecordMetadataProvider,
) {
  async function findById(id: string): Promise<PublicSubmission | null> {
    const row = await firstRow<PublicSubmissionRow>(
      db.prepare('SELECT * FROM public_submissions WHERE id = ? LIMIT 1').bind(id),
      'publicSubmission.findById',
    );
    return row ? mapPublicSubmission(row) : null;
  }

  async function findBatchById(id: string): Promise<PublicSubmissionBatch | null> {
    const row = await firstRow<{
      id: string;
      preview_checksum: string;
      result_json: string;
      created_at: string;
      updated_at: string;
    }>(
      db.prepare('SELECT * FROM public_submission_batches WHERE id = ? LIMIT 1').bind(id),
      'publicSubmission.findBatchById',
    );
    return row
      ? {
          id: row.id,
          previewChecksum: row.preview_checksum,
          resultJson: row.result_json,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        }
      : null;
  }

  async function create(input: CreatePublicSubmissionInput): Promise<PublicSubmission> {
    input.requestedHandles.forEach((handle) => normalizeHandle(handle));
    const id = input.id ?? metadata.createId();
    const timestamp = input.createdAt ?? metadata.now();
    await runStatement(
      db
        .prepare(
          `INSERT INTO public_submissions (
            id, creator_name, category, country_codes, requested_handles, public_sources,
            submission_status, created_at, reviewed_at, updated_at, normalized_creator_name,
            submission_fingerprint, batch_reference, batch_row_number
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?)`,
        )
        .bind(
          id,
          input.creatorName.trim(),
          input.category ?? null,
          input.countryCodes ? serializeJson(input.countryCodes) : null,
          serializeJson(input.requestedHandles.map((handle) => handle.trim())),
          serializeJson(input.publicSources),
          input.submissionStatus ?? 'pending',
          timestamp,
          timestamp,
          input.normalizedCreatorName ?? normalizeCreatorName(input.creatorName),
          input.submissionFingerprint ?? null,
          input.batchReference ?? null,
          input.batchRowNumber ?? null,
        ),
      'publicSubmission.create',
    );
    const created = await findById(id);
    if (!created) throw createNotFoundError('public submission', id);
    return created;
  }

  async function listActive(): Promise<PublicSubmission[]> {
    const rows = await allRows<PublicSubmissionRow>(
      db.prepare(
        `SELECT * FROM public_submissions
           WHERE submission_status IN ('pending', 'under_review')
           ORDER BY created_at DESC, id DESC`,
      ),
      'publicSubmission.listActive',
    );
    return rows.map(mapPublicSubmission);
  }

  async function commitBatch(input: CommitPublicSubmissionBatchInput): Promise<void> {
    const submissionPayload = input.submissions.map((submission) => ({
      id: submission.id,
      creatorName: submission.creatorName.trim(),
      normalizedCreatorName:
        submission.normalizedCreatorName ?? normalizeCreatorName(submission.creatorName),
      category: submission.category ?? null,
      countryCodes: submission.countryCodes ?? null,
      requestedHandles: submission.requestedHandles.map((handle) => handle.trim()),
      publicSources: submission.publicSources,
      submissionFingerprint: submission.submissionFingerprint ?? null,
      batchReference: submission.batchReference ?? input.id,
      batchRowNumber: submission.batchRowNumber ?? null,
      submissionStatus: submission.submissionStatus ?? 'pending',
      createdAt: submission.createdAt ?? input.createdAt,
    }));
    const statements = [
      db
        .prepare(
          `INSERT INTO public_submission_batches (
            id, preview_checksum, result_json, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?)`,
        )
        .bind(input.id, input.previewChecksum, input.resultJson, input.createdAt, input.createdAt),
      db
        .prepare(
          `INSERT INTO public_submissions (
            id, creator_name, normalized_creator_name, category, country_codes,
            requested_handles, public_sources, submission_fingerprint, batch_reference,
            batch_row_number, submission_status, created_at, reviewed_at, updated_at
          )
          SELECT
            json_extract(value, '$.id'),
            json_extract(value, '$.creatorName'),
            json_extract(value, '$.normalizedCreatorName'),
            json_extract(value, '$.category'),
            json_extract(value, '$.countryCodes'),
            json_extract(value, '$.requestedHandles'),
            json_extract(value, '$.publicSources'),
            json_extract(value, '$.submissionFingerprint'),
            json_extract(value, '$.batchReference'),
            json_extract(value, '$.batchRowNumber'),
            json_extract(value, '$.submissionStatus'),
            json_extract(value, '$.createdAt'),
            NULL,
            json_extract(value, '$.createdAt')
          FROM json_each(?)`,
        )
        .bind(JSON.stringify(submissionPayload)),
    ];
    await withDatabaseErrorMapping('publicSubmission.commitBatch', () => db.batch(statements));
  }

  async function list(
    options: PublicSubmissionListOptions = {},
  ): Promise<PaginatedResult<PublicSubmission>> {
    const { page, limit, offset } = resolvePagination(options);
    const rows = await allRows<PublicSubmissionRow>(
      db
        .prepare(
          `SELECT * FROM public_submissions WHERE (? IS NULL OR submission_status = ?)
           ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
        )
        .bind(options.submissionStatus ?? null, options.submissionStatus ?? null, limit, offset),
      'publicSubmission.list',
    );
    return { items: rows.map(mapPublicSubmission), page, limit };
  }

  async function count(options: Omit<PublicSubmissionListOptions, keyof Pagination> = {}) {
    const row = await firstRow<{ count: number }>(
      db
        .prepare(
          `SELECT COUNT(*) AS count FROM public_submissions
           WHERE (? IS NULL OR submission_status = ?)`,
        )
        .bind(options.submissionStatus ?? null, options.submissionStatus ?? null),
      'publicSubmission.count',
    );
    return row?.count ?? 0;
  }

  async function updateStatus(
    id: string,
    submissionStatus: SubmissionStatus,
  ): Promise<PublicSubmission> {
    const timestamp = metadata.now();
    const result = await runStatement(
      db
        .prepare(
          `UPDATE public_submissions SET submission_status = ?, reviewed_at = ?, updated_at = ?
           WHERE id = ?`,
        )
        .bind(submissionStatus, submissionStatus === 'pending' ? null : timestamp, timestamp, id),
      'publicSubmission.updateStatus',
    );
    if ((result.meta.changes ?? 0) === 0) throw createNotFoundError('public submission', id);
    const updated = await findById(id);
    if (!updated) throw createNotFoundError('public submission', id);
    return updated;
  }

  return {
    commitBatch,
    count,
    create,
    findBatchById,
    findById,
    list,
    listActive,
    updateStatus,
  };
}
