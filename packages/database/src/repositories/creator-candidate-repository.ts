import type { CandidateStatus } from '@open-creator-registry/contracts/domain';
import { normalizeCreatorName } from '@open-creator-registry/normalization';

import { createNotFoundError } from '../errors';
import { serializeJson } from '../json';
import type { CreatorCandidate, PaginatedResult, Pagination } from '../models';
import { defaultRecordMetadataProvider, type RecordMetadataProvider } from '../runtime';
import { mapCreatorCandidate, type CreatorCandidateRow } from './row-mappers';
import { allRows, firstRow, resolvePagination, runStatement } from './shared';

export type CreateCreatorCandidateInput = {
  canonicalName: string;
  category?: string | null;
  countryCodes?: string[] | null;
  discoverySource: string;
  confidenceScore: number;
  reviewStatus?: CandidateStatus;
  discoveredAt?: string;
};

export type CreatorCandidateListOptions = Pagination & {
  reviewStatus?: CandidateStatus;
  category?: string;
};

export function createCreatorCandidateRepository(
  db: D1Database,
  metadata: RecordMetadataProvider = defaultRecordMetadataProvider,
) {
  async function findById(id: string): Promise<CreatorCandidate | null> {
    const row = await firstRow<CreatorCandidateRow>(
      db.prepare('SELECT * FROM creator_candidates WHERE id = ? LIMIT 1').bind(id),
      'creatorCandidate.findById',
    );
    return row ? mapCreatorCandidate(row) : null;
  }

  async function create(input: CreateCreatorCandidateInput): Promise<CreatorCandidate> {
    const id = metadata.createId();
    const timestamp = metadata.now();
    await runStatement(
      db
        .prepare(
          `INSERT INTO creator_candidates (
            id, canonical_name, normalized_name, category, country_codes, discovery_source,
            confidence_score, review_status, discovered_at, reviewed_at, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
        )
        .bind(
          id,
          input.canonicalName.trim(),
          normalizeCreatorName(input.canonicalName),
          input.category ?? null,
          input.countryCodes ? serializeJson(input.countryCodes) : null,
          input.discoverySource,
          input.confidenceScore,
          input.reviewStatus ?? 'pending',
          input.discoveredAt ?? timestamp,
          timestamp,
          timestamp,
        ),
      'creatorCandidate.create',
    );
    const created = await findById(id);
    if (!created) throw createNotFoundError('creator candidate', id);
    return created;
  }

  async function list(
    options: CreatorCandidateListOptions = {},
  ): Promise<PaginatedResult<CreatorCandidate>> {
    const { page, limit, offset } = resolvePagination(options);
    const rows = await allRows<CreatorCandidateRow>(
      db
        .prepare(
          `SELECT * FROM creator_candidates
           WHERE (? IS NULL OR review_status = ?) AND (? IS NULL OR category = ?)
           ORDER BY discovered_at DESC, id DESC LIMIT ? OFFSET ?`,
        )
        .bind(
          options.reviewStatus ?? null,
          options.reviewStatus ?? null,
          options.category ?? null,
          options.category ?? null,
          limit,
          offset,
        ),
      'creatorCandidate.list',
    );
    return { items: rows.map(mapCreatorCandidate), page, limit };
  }

  async function updateReviewStatus(
    id: string,
    reviewStatus: CandidateStatus,
  ): Promise<CreatorCandidate> {
    const timestamp = metadata.now();
    const result = await runStatement(
      db
        .prepare(
          `UPDATE creator_candidates SET review_status = ?, reviewed_at = ?, updated_at = ?
           WHERE id = ?`,
        )
        .bind(reviewStatus, reviewStatus === 'pending' ? null : timestamp, timestamp, id),
      'creatorCandidate.updateReviewStatus',
    );
    if ((result.meta.changes ?? 0) === 0) throw createNotFoundError('creator candidate', id);
    const updated = await findById(id);
    if (!updated) throw createNotFoundError('creator candidate', id);
    return updated;
  }

  return { create, findById, list, updateReviewStatus };
}
