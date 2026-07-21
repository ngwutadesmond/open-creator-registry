import type { SubmissionStatus } from '@open-creator-registry/contracts/domain';
import { normalizeCreatorName, normalizeHandle } from '@open-creator-registry/normalization';

import { createNotFoundError } from '../errors';
import { serializeJson } from '../json';
import type { PaginatedResult, Pagination, PublicSubmission } from '../models';
import { defaultRecordMetadataProvider, type RecordMetadataProvider } from '../runtime';
import { mapPublicSubmission, type PublicSubmissionRow } from './row-mappers';
import { allRows, firstRow, resolvePagination, runStatement } from './shared';

export type CreatePublicSubmissionInput = {
  creatorName: string;
  category?: string | null;
  countryCodes?: string[] | null;
  requestedHandles: string[];
  publicSources: string[];
  submissionStatus?: SubmissionStatus;
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

  async function create(input: CreatePublicSubmissionInput): Promise<PublicSubmission> {
    input.requestedHandles.forEach((handle) => normalizeHandle(handle));
    const id = metadata.createId();
    const timestamp = metadata.now();
    await runStatement(
      db
        .prepare(
          `INSERT INTO public_submissions (
            id, creator_name, category, country_codes, requested_handles, public_sources,
            submission_status, created_at, reviewed_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
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
        ),
      'publicSubmission.create',
    );
    const created = await findById(id);
    if (!created) throw createNotFoundError('public submission', id);
    return created;
  }

  async function findPendingDuplicate(
    input: CreatePublicSubmissionInput,
  ): Promise<PublicSubmission | null> {
    const rows = await allRows<PublicSubmissionRow>(
      db.prepare(
        `SELECT * FROM public_submissions
           WHERE submission_status IN ('pending', 'under_review')
           ORDER BY created_at DESC, id DESC LIMIT 20`,
      ),
      'publicSubmission.findPendingDuplicate',
    );
    const requestedHandles = input.requestedHandles.map((handle) => normalizeHandle(handle)).sort();
    const publicSources = input.publicSources.map((source) => source.trim()).sort();
    const creatorName = normalizeCreatorName(input.creatorName);

    for (const row of rows) {
      const submission = mapPublicSubmission(row);
      if (normalizeCreatorName(submission.creatorName) !== creatorName) continue;
      const existingHandles = submission.requestedHandles
        .map((handle) => normalizeHandle(handle))
        .sort();
      const existingSources = submission.publicSources.map((source) => source.trim()).sort();
      if (
        JSON.stringify(existingHandles) === JSON.stringify(requestedHandles) &&
        JSON.stringify(existingSources) === JSON.stringify(publicSources)
      ) {
        return submission;
      }
    }
    return null;
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

  return { create, findById, findPendingDuplicate, list, updateStatus };
}
