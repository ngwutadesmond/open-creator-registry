import type { RegistryReleaseStatus } from '@open-creator-registry/contracts/domain';

import { createInvalidInputError, createNotFoundError, withDatabaseErrorMapping } from '../errors';
import type { PaginatedResult, Pagination, RegistryRelease } from '../models';
import { defaultRecordMetadataProvider, type RecordMetadataProvider } from '../runtime';
import { mapRegistryRelease, type RegistryReleaseRow } from './row-mappers';
import { allRows, firstRow, resolvePagination, runStatement } from './shared';

export type CreateRegistryReleaseInput = {
  version: string;
  recordCount: number;
  checksum: string;
};

export type RegistryReleaseListOptions = Pagination & {
  releaseStatus?: RegistryReleaseStatus;
};

export function createRegistryReleaseRepository(
  db: D1Database,
  metadata: RecordMetadataProvider = defaultRecordMetadataProvider,
) {
  async function findById(id: string): Promise<RegistryRelease | null> {
    const row = await firstRow<RegistryReleaseRow>(
      db.prepare('SELECT * FROM registry_releases WHERE id = ? LIMIT 1').bind(id),
      'registryRelease.findById',
    );
    return row ? mapRegistryRelease(row) : null;
  }

  async function createDraft(input: CreateRegistryReleaseInput): Promise<RegistryRelease> {
    const id = metadata.createId();
    const timestamp = metadata.now();
    await runStatement(
      db
        .prepare(
          `INSERT INTO registry_releases (
            id, version, record_count, checksum, release_status, published_at, created_at, updated_at
          ) VALUES (?, ?, ?, ?, 'draft', NULL, ?, ?)`,
        )
        .bind(id, input.version, input.recordCount, input.checksum, timestamp, timestamp),
      'registryRelease.createDraft',
    );
    const created = await findById(id);
    if (!created) throw createNotFoundError('registry release', id);
    return created;
  }

  async function findLatestPublished(): Promise<RegistryRelease | null> {
    const row = await firstRow<RegistryReleaseRow>(
      db.prepare(
        `SELECT * FROM registry_releases WHERE release_status = 'published'
         ORDER BY published_at DESC, created_at DESC, id DESC LIMIT 1`,
      ),
      'registryRelease.findLatestPublished',
    );
    return row ? mapRegistryRelease(row) : null;
  }

  async function list(
    options: RegistryReleaseListOptions = {},
  ): Promise<PaginatedResult<RegistryRelease>> {
    const { page, limit, offset } = resolvePagination(options);
    const rows = await allRows<RegistryReleaseRow>(
      db
        .prepare(
          `SELECT * FROM registry_releases WHERE (? IS NULL OR release_status = ?)
           ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
        )
        .bind(options.releaseStatus ?? null, options.releaseStatus ?? null, limit, offset),
      'registryRelease.list',
    );
    return { items: rows.map(mapRegistryRelease), page, limit };
  }

  async function count(options: Omit<RegistryReleaseListOptions, keyof Pagination> = {}) {
    const row = await firstRow<{ count: number }>(
      db
        .prepare(
          'SELECT COUNT(*) AS count FROM registry_releases WHERE (? IS NULL OR release_status = ?)',
        )
        .bind(options.releaseStatus ?? null, options.releaseStatus ?? null),
      'registryRelease.count',
    );
    return row?.count ?? 0;
  }

  async function listPublic(
    pagination: Pagination = {},
  ): Promise<PaginatedResult<RegistryRelease>> {
    const { page, limit, offset } = resolvePagination(pagination);
    const rows = await allRows<RegistryReleaseRow>(
      db
        .prepare(
          `SELECT * FROM registry_releases
           WHERE release_status IN ('published', 'superseded') AND published_at IS NOT NULL
           ORDER BY published_at DESC, created_at DESC, id DESC LIMIT ? OFFSET ?`,
        )
        .bind(limit, offset),
      'registryRelease.listPublic',
    );
    return { items: rows.map(mapRegistryRelease), page, limit };
  }

  async function countPublic(): Promise<number> {
    const row = await firstRow<{ count: number }>(
      db.prepare(
        `SELECT COUNT(*) AS count FROM registry_releases
         WHERE release_status IN ('published', 'superseded') AND published_at IS NOT NULL`,
      ),
      'registryRelease.countPublic',
    );
    return row?.count ?? 0;
  }

  async function publish(id: string): Promise<RegistryRelease> {
    const current = await findById(id);
    if (!current) throw createNotFoundError('registry release', id);
    if (current.releaseStatus !== 'draft') {
      throw createInvalidInputError('Only a draft registry release can be published.');
    }
    const timestamp = metadata.now();
    const results = await withDatabaseErrorMapping('registryRelease.publish', () =>
      db.batch([
        db
          .prepare(
            `UPDATE registry_releases SET release_status = 'superseded', updated_at = ?
             WHERE release_status = 'published' AND id <> ?
               AND EXISTS (
                 SELECT 1 FROM registry_releases target
                 WHERE target.id = ? AND target.release_status = 'draft'
               )`,
          )
          .bind(timestamp, id, id),
        db
          .prepare(
            `UPDATE registry_releases SET release_status = 'published', published_at = ?, updated_at = ?
             WHERE id = ? AND release_status = 'draft'`,
          )
          .bind(timestamp, timestamp, id),
      ]),
    );
    if ((results[1]?.meta.changes ?? 0) === 0) {
      throw createInvalidInputError('Only a draft registry release can be published.');
    }
    const published = await findById(id);
    if (!published) throw createNotFoundError('registry release', id);
    return published;
  }

  return {
    createDraft,
    findById,
    findLatestPublished,
    list,
    count,
    listPublic,
    countPublic,
    publish,
  };
}
