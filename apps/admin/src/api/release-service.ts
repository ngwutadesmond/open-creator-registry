import { createRegistryReleaseRepository } from '@open-creator-registry/database/repositories/registry-release-repository';
import { createRegistryReleaseSnapshotRepository } from '@open-creator-registry/database/repositories/registry-release-snapshot-repository';

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

const snapshotHandleSchema = z.object({
  id: z.string(),
  creator_entity_id: z.string(),
  normalized_handle: z.string(),
  classification: z.string(),
  status: z.string(),
  updated_at: z.string(),
});
type SnapshotHandle = z.infer<typeof snapshotHandleSchema>;

function snapshotHandles(value: unknown): SnapshotHandle[] {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('handles' in value) ||
    !Array.isArray(value.handles)
  )
    return [];
  return value.handles.flatMap((item) => {
    const parsed = snapshotHandleSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}

export function createAdminReleaseService(db: D1Database) {
  const releases = createRegistryReleaseRepository(db);
  const snapshots = createRegistryReleaseSnapshotRepository(db);

  async function calculate(releaseId: string, actorIdentifier: string, requestId: string) {
    const release = await releases.findById(releaseId);
    if (!release) return null;
    if (release.releaseStatus !== 'draft')
      throw createInvalidInputError('Only a draft release can be recalculated.');
    const state = await snapshots.readCurrentState();
    const snapshot = { creators: state.creators, handles: state.handles };
    const checksum = await sha256(JSON.stringify(snapshot));
    const hardReservedCount = state.handles.filter(
      (handle) => handle.classification === 'hard_reserved',
    ).length;
    const softProtectedCount = state.handles.filter(
      (handle) => handle.classification === 'soft_protected',
    ).length;
    const monitoredCount = state.handles.filter(
      (handle) => handle.classification === 'monitored',
    ).length;
    const saved = await snapshots.save({
      releaseId,
      snapshot,
      creatorCount: state.creators.length,
      activeHandleCount: state.handles.length,
      hardReservedCount,
      softProtectedCount,
      monitoredCount,
      checksum,
      createdBy: actorIdentifier,
      requestId,
    });

    const previousRelease = await releases.findLatestPublished();
    const previousSnapshot = previousRelease
      ? await snapshots.findByReleaseId(previousRelease.id)
      : null;
    const previousHandles = new Map(
      snapshotHandles(previousSnapshot?.snapshot).map((handle) => [
        handle.normalized_handle,
        handle,
      ]),
    );
    const currentHandles = new Map(
      state.handles.map((handle) => [handle.normalized_handle, handle]),
    );
    const added = state.handles.filter((handle) => !previousHandles.has(handle.normalized_handle));
    const removed = [...previousHandles.values()].filter(
      (handle) => !currentHandles.has(handle.normalized_handle),
    );
    const changed = state.handles.filter((handle) => {
      const previous = previousHandles.get(handle.normalized_handle);
      return (
        previous &&
        (previous.classification !== handle.classification || previous.status !== handle.status)
      );
    });
    return {
      snapshot: saved,
      diff: { added, removed, changed },
      previous_release: previousRelease,
    };
  }

  return { calculate };
}
import { z } from 'zod';

import { createInvalidInputError } from '@open-creator-registry/database/errors';
