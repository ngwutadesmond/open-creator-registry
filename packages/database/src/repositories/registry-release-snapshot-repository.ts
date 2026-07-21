import { createNotFoundError, withDatabaseErrorMapping } from '../errors';
import { parseJson, serializeJson, type JsonValue } from '../json';
import type { RegistryReleaseSnapshot } from '../models';
import { defaultRecordMetadataProvider, type RecordMetadataProvider } from '../runtime';
import { allRows, firstRow } from './shared';

type SnapshotRow = {
  id: string;
  registry_release_id: string;
  snapshot: string;
  creator_count: number;
  active_handle_count: number;
  hard_reserved_count: number;
  soft_protected_count: number;
  monitored_count: number;
  checksum: string;
  created_by: string;
  generated_at: string;
};

function mapSnapshot(row: SnapshotRow): RegistryReleaseSnapshot {
  return {
    id: row.id,
    registryReleaseId: row.registry_release_id,
    snapshot: parseJson(row.snapshot, 'registry release snapshot'),
    creatorCount: row.creator_count,
    activeHandleCount: row.active_handle_count,
    hardReservedCount: row.hard_reserved_count,
    softProtectedCount: row.soft_protected_count,
    monitoredCount: row.monitored_count,
    checksum: row.checksum,
    createdBy: row.created_by,
    generatedAt: row.generated_at,
  };
}

export type ReleaseStateRow = {
  id: string;
  creator_entity_id: string;
  normalized_handle: string;
  classification: string;
  status: string;
  updated_at: string;
};

export function createRegistryReleaseSnapshotRepository(
  db: D1Database,
  metadata: RecordMetadataProvider = defaultRecordMetadataProvider,
) {
  async function findByReleaseId(releaseId: string): Promise<RegistryReleaseSnapshot | null> {
    const row = await firstRow<SnapshotRow>(
      db
        .prepare('SELECT * FROM registry_release_snapshots WHERE registry_release_id = ? LIMIT 1')
        .bind(releaseId),
      'registryReleaseSnapshot.findByReleaseId',
    );
    return row ? mapSnapshot(row) : null;
  }

  async function readCurrentState(): Promise<{
    creators: Array<{ id: string; updated_at: string }>;
    handles: ReleaseStateRow[];
  }> {
    const [creators, handles] = await Promise.all([
      allRows<{ id: string; updated_at: string }>(
        db.prepare(
          `SELECT id, updated_at FROM creator_entities WHERE review_status = 'approved'
             ORDER BY id`,
        ),
        'registryReleaseSnapshot.readCreators',
      ),
      allRows<ReleaseStateRow>(
        db.prepare(
          `SELECT id, creator_entity_id, normalized_handle, classification, status, updated_at
           FROM reserved_handles WHERE status <> 'released' AND classification <> 'not_listed'
           ORDER BY normalized_handle, id`,
        ),
        'registryReleaseSnapshot.readHandles',
      ),
    ]);
    return { creators, handles };
  }

  async function save(input: {
    releaseId: string;
    snapshot: JsonValue;
    creatorCount: number;
    activeHandleCount: number;
    hardReservedCount: number;
    softProtectedCount: number;
    monitoredCount: number;
    checksum: string;
    createdBy: string;
    requestId: string;
  }): Promise<RegistryReleaseSnapshot> {
    const existing = await findByReleaseId(input.releaseId);
    const id = existing?.id ?? metadata.createId();
    const timestamp = metadata.now();
    await withDatabaseErrorMapping('registryReleaseSnapshot.save', () =>
      db.batch([
        db
          .prepare(
            `INSERT INTO registry_release_snapshots (
              id, registry_release_id, snapshot, creator_count, active_handle_count,
              hard_reserved_count, soft_protected_count, monitored_count, checksum, created_by,
              generated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(registry_release_id) DO UPDATE SET snapshot = excluded.snapshot,
              creator_count = excluded.creator_count, active_handle_count = excluded.active_handle_count,
              hard_reserved_count = excluded.hard_reserved_count,
              soft_protected_count = excluded.soft_protected_count,
              monitored_count = excluded.monitored_count, checksum = excluded.checksum,
              created_by = excluded.created_by, generated_at = excluded.generated_at`,
          )
          .bind(
            id,
            input.releaseId,
            serializeJson(input.snapshot),
            input.creatorCount,
            input.activeHandleCount,
            input.hardReservedCount,
            input.softProtectedCount,
            input.monitoredCount,
            input.checksum,
            input.createdBy,
            timestamp,
          ),
        db
          .prepare(
            `UPDATE registry_releases SET record_count = ?, checksum = ?, updated_at = ?
             WHERE id = ? AND release_status = 'draft'`,
          )
          .bind(input.activeHandleCount, input.checksum, timestamp, input.releaseId),
        db
          .prepare(
            `INSERT INTO audit_logs (
              id, action, entity_type, entity_id, actor_identifier, previous_value, new_value,
              metadata, created_at
            ) VALUES (?, 'release.calculated', 'registry_release', ?, ?, NULL, ?, ?, ?)`,
          )
          .bind(
            metadata.createId(),
            input.releaseId,
            input.createdBy,
            serializeJson({ checksum: input.checksum, record_count: input.activeHandleCount }),
            serializeJson({ request_id: input.requestId }),
            timestamp,
          ),
      ]),
    );
    const saved = await findByReleaseId(input.releaseId);
    if (!saved) throw createNotFoundError('registry release snapshot', input.releaseId);
    return saved;
  }

  return { findByReleaseId, readCurrentState, save };
}
