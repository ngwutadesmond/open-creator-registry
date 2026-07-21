import type { SourceRunLock } from '../models';
import { defaultRecordMetadataProvider, type RecordMetadataProvider } from '../runtime';
import { allRows, firstRow, runStatement } from './shared';

type SourceRunLockRow = {
  source_name: string;
  scope_key: string;
  run_id: string;
  lease_owner: string;
  acquired_at: string;
  expires_at: string;
  heartbeat_at: string;
};

function mapLock(row: SourceRunLockRow): SourceRunLock {
  return {
    sourceName: row.source_name,
    scopeKey: row.scope_key,
    runId: row.run_id,
    leaseOwner: row.lease_owner,
    acquiredAt: row.acquired_at,
    expiresAt: row.expires_at,
    heartbeatAt: row.heartbeat_at,
  };
}

export function createSourceLockRepository(
  db: D1Database,
  metadata: RecordMetadataProvider = defaultRecordMetadataProvider,
) {
  async function find(sourceName: string, scopeKey: string): Promise<SourceRunLock | null> {
    const row = await firstRow<SourceRunLockRow>(
      db
        .prepare('SELECT * FROM source_run_locks WHERE source_name = ? AND scope_key = ? LIMIT 1')
        .bind(sourceName, scopeKey),
      'sourceLock.find',
    );
    return row ? mapLock(row) : null;
  }

  async function acquire(input: {
    sourceName: string;
    scopeKey: string;
    runId: string;
    leaseOwner: string;
    leaseDurationMs: number;
  }): Promise<SourceRunLock | null> {
    const timestamp = metadata.now();
    const expiresAt = new Date(new Date(timestamp).getTime() + input.leaseDurationMs).toISOString();
    const result = await runStatement(
      db
        .prepare(
          `INSERT INTO source_run_locks (
            source_name, scope_key, run_id, lease_owner, acquired_at, expires_at, heartbeat_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(source_name, scope_key) DO UPDATE SET run_id = excluded.run_id,
            lease_owner = excluded.lease_owner, acquired_at = excluded.acquired_at,
            expires_at = excluded.expires_at, heartbeat_at = excluded.heartbeat_at
          WHERE source_run_locks.expires_at <= ?`,
        )
        .bind(
          input.sourceName,
          input.scopeKey,
          input.runId,
          input.leaseOwner,
          timestamp,
          expiresAt,
          timestamp,
          timestamp,
        ),
      'sourceLock.acquire',
    );
    return (result.meta.changes ?? 0) === 0 ? null : find(input.sourceName, input.scopeKey);
  }

  async function heartbeat(
    sourceName: string,
    scopeKey: string,
    runId: string,
    leaseOwner: string,
    leaseDurationMs: number,
  ): Promise<boolean> {
    const timestamp = metadata.now();
    const expiresAt = new Date(new Date(timestamp).getTime() + leaseDurationMs).toISOString();
    const result = await runStatement(
      db
        .prepare(
          `UPDATE source_run_locks SET heartbeat_at = ?, expires_at = ?
           WHERE source_name = ? AND scope_key = ? AND run_id = ? AND lease_owner = ?`,
        )
        .bind(timestamp, expiresAt, sourceName, scopeKey, runId, leaseOwner),
      'sourceLock.heartbeat',
    );
    return (result.meta.changes ?? 0) === 1;
  }

  async function release(
    sourceName: string,
    scopeKey: string,
    runId: string,
    leaseOwner: string,
  ): Promise<boolean> {
    const result = await runStatement(
      db
        .prepare(
          `DELETE FROM source_run_locks WHERE source_name = ? AND scope_key = ?
           AND run_id = ? AND lease_owner = ?`,
        )
        .bind(sourceName, scopeKey, runId, leaseOwner),
      'sourceLock.release',
    );
    return (result.meta.changes ?? 0) === 1;
  }

  async function forceRelease(sourceName: string, scopeKey: string): Promise<boolean> {
    const result = await runStatement(
      db
        .prepare('DELETE FROM source_run_locks WHERE source_name = ? AND scope_key = ?')
        .bind(sourceName, scopeKey),
      'sourceLock.forceRelease',
    );
    return (result.meta.changes ?? 0) === 1;
  }

  async function list(): Promise<SourceRunLock[]> {
    const rows = await allRows<SourceRunLockRow>(
      db.prepare('SELECT * FROM source_run_locks ORDER BY source_name, scope_key'),
      'sourceLock.list',
    );
    return rows.map(mapLock);
  }

  return { find, acquire, heartbeat, release, forceRelease, list };
}
