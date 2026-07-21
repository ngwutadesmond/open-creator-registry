import { firstRow } from './shared';

export type PublicRegistrySnapshot = {
  creatorCount: number;
  activeReservedHandleCount: number;
  lastUpdatedAt: string | null;
};

type PublicRegistrySnapshotRow = {
  creator_count: number;
  active_reserved_handle_count: number;
  last_updated_at: string | null;
};

export function createPublicRegistryRepository(db: D1Database) {
  async function checkConnectivity(): Promise<boolean> {
    const row = await firstRow<{ ok: number }>(
      db.prepare('SELECT 1 AS ok'),
      'publicRegistry.checkConnectivity',
    );
    return row?.ok === 1;
  }

  async function getSnapshot(): Promise<PublicRegistrySnapshot> {
    const row = await firstRow<PublicRegistrySnapshotRow>(
      db.prepare(
        `SELECT
          (SELECT COUNT(*) FROM creator_entities WHERE review_status = 'approved') AS creator_count,
          (
            SELECT COUNT(*) FROM reserved_handles
            WHERE status = 'active' AND classification <> 'not_listed'
          ) AS active_reserved_handle_count,
          (
            SELECT MAX(updated_at) FROM (
              SELECT updated_at FROM creator_entities WHERE review_status = 'approved'
              UNION ALL
              SELECT updated_at FROM reserved_handles WHERE classification <> 'not_listed'
              UNION ALL
              SELECT updated_at FROM registry_releases WHERE release_status = 'published'
            )
          ) AS last_updated_at`,
      ),
      'publicRegistry.getSnapshot',
    );
    return {
      creatorCount: row?.creator_count ?? 0,
      activeReservedHandleCount: row?.active_reserved_handle_count ?? 0,
      lastUpdatedAt: row?.last_updated_at ?? null,
    };
  }

  return { checkConnectivity, getSnapshot };
}
