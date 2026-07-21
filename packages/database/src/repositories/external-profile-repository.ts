import {
  externalProfilePlatforms,
  type ExternalProfilePlatform,
  type ExternalProfileVerificationStatus,
  type ExternalProfileVisibilityStatus,
} from '@open-creator-registry/contracts/sources';
import {
  normalizeExternalProfilePlatform,
  normalizeExternalProfileUrl,
  normalizePlatformHandle,
  validateExternalProfileLocator,
} from '@open-creator-registry/normalization/external-profiles';

import { createInvalidInputError, createNotFoundError, withDatabaseErrorMapping } from '../errors';
import type { CreatorExternalProfile } from '../models';
import { defaultRecordMetadataProvider, type RecordMetadataProvider } from '../runtime';
import { allRows, firstRow, runStatement } from './shared';

type ExternalProfileRow = {
  id: string;
  creator_entity_id: string;
  platform: ExternalProfilePlatform;
  platform_account_id: string | null;
  platform_handle: string | null;
  normalized_platform_handle: string | null;
  profile_url: string | null;
  normalized_profile_url: string | null;
  profile_name: string | null;
  is_primary: number;
  verification_status: ExternalProfileVerificationStatus;
  visibility_status: ExternalProfileVisibilityStatus;
  source_name: string;
  source_reference: string | null;
  source_license: string | null;
  confidence_score: number;
  connector_version: string | null;
  mapping_version: string | null;
  first_seen_at: string;
  last_seen_at: string;
  last_verified_at: string | null;
  created_at: string;
  updated_at: string;
};

function mapProfile(row: ExternalProfileRow): CreatorExternalProfile {
  return {
    id: row.id,
    creatorEntityId: row.creator_entity_id,
    platform: row.platform,
    platformAccountId: row.platform_account_id,
    platformHandle: row.platform_handle,
    normalizedPlatformHandle: row.normalized_platform_handle,
    profileUrl: row.profile_url,
    normalizedProfileUrl: row.normalized_profile_url,
    profileName: row.profile_name,
    isPrimary: row.is_primary === 1,
    verificationStatus: row.verification_status,
    visibilityStatus: row.visibility_status,
    sourceName: row.source_name,
    sourceReference: row.source_reference,
    sourceLicense: row.source_license,
    confidenceScore: row.confidence_score,
    connectorVersion: row.connector_version,
    mappingVersion: row.mapping_version,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
    lastVerifiedAt: row.last_verified_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export type ExternalProfileWriteInput = {
  creatorEntityId: string;
  platform: ExternalProfilePlatform | 'twitter';
  platformAccountId?: string | null;
  platformHandle?: string | null;
  profileUrl?: string | null;
  profileName?: string | null;
  isPrimary?: boolean;
  verificationStatus: ExternalProfileVerificationStatus;
  visibilityStatus: ExternalProfileVisibilityStatus;
  sourceName: string;
  sourceReference?: string | null;
  sourceLicense?: string | null;
  confidenceScore: number;
  connectorVersion?: string | null;
  mappingVersion?: string | null;
  firstSeenAt?: string;
  lastSeenAt?: string;
  lastVerifiedAt?: string | null;
};

export type ExternalProfileConflict = {
  type: 'stable_account' | 'profile_url' | 'primary_profile' | 'source_association';
  profileId: string;
  creatorEntityId: string;
};

function prepareInput(input: ExternalProfileWriteInput) {
  const platform = normalizeExternalProfilePlatform(input.platform);
  if (!externalProfilePlatforms.includes(platform)) {
    throw createInvalidInputError('The external profile platform is unsupported.');
  }
  validateExternalProfileLocator(input);
  let normalizedHandle: string | null;
  let normalizedUrl: string | null;
  try {
    normalizedHandle = normalizePlatformHandle(input.platformHandle);
    normalizedUrl = normalizeExternalProfileUrl(platform, input.profileUrl);
  } catch (error) {
    throw createInvalidInputError(
      error instanceof Error ? error.message : 'The external profile locator is invalid.',
    );
  }
  return {
    ...input,
    platform,
    platformAccountId: input.platformAccountId?.trim() || null,
    platformHandle: input.platformHandle?.trim().replace(/^@+/u, '') || null,
    normalizedHandle,
    profileUrl: normalizedUrl,
    normalizedUrl,
    profileName: input.profileName?.trim() || null,
    sourceName: input.sourceName.trim(),
    sourceReference: input.sourceReference?.trim() || null,
    sourceLicense: input.sourceLicense?.trim() || null,
    connectorVersion: input.connectorVersion?.trim() || null,
    mappingVersion: input.mappingVersion?.trim() || null,
  };
}

export function createExternalProfileRepository(
  db: D1Database,
  metadata: RecordMetadataProvider = defaultRecordMetadataProvider,
) {
  async function findById(id: string): Promise<CreatorExternalProfile | null> {
    const row = await firstRow<ExternalProfileRow>(
      db.prepare('SELECT * FROM creator_external_profiles WHERE id = ? LIMIT 1').bind(id),
      'externalProfile.findById',
    );
    return row ? mapProfile(row) : null;
  }

  async function listByCreator(creatorEntityId: string): Promise<CreatorExternalProfile[]> {
    const rows = await allRows<ExternalProfileRow>(
      db
        .prepare(
          `SELECT * FROM creator_external_profiles WHERE creator_entity_id = ?
           ORDER BY platform, is_primary DESC, created_at, id`,
        )
        .bind(creatorEntityId),
      'externalProfile.listByCreator',
    );
    return rows.map(mapProfile);
  }

  async function listPublicByCreator(creatorEntityId: string): Promise<CreatorExternalProfile[]> {
    const rows = await allRows<ExternalProfileRow>(
      db
        .prepare(
          `SELECT * FROM creator_external_profiles WHERE creator_entity_id = ?
             AND visibility_status = 'public'
             AND verification_status IN (
               'source_linked', 'cross_source_confirmed', 'manually_verified', 'creator_verified'
             )
           ORDER BY platform, is_primary DESC, created_at, id`,
        )
        .bind(creatorEntityId),
      'externalProfile.listPublicByCreator',
    );
    return rows.map(mapProfile);
  }

  async function findByPlatformAccountId(
    platformInput: ExternalProfilePlatform | 'twitter',
    platformAccountId: string,
  ): Promise<CreatorExternalProfile | null> {
    const platform = normalizeExternalProfilePlatform(platformInput);
    const row = await firstRow<ExternalProfileRow>(
      db
        .prepare(
          `SELECT * FROM creator_external_profiles
           WHERE platform = ? AND platform_account_id = ? LIMIT 1`,
        )
        .bind(platform, platformAccountId.trim()),
      'externalProfile.findByPlatformAccountId',
    );
    return row ? mapProfile(row) : null;
  }

  async function findByNormalizedProfileUrl(
    normalizedProfileUrl: string,
  ): Promise<CreatorExternalProfile | null> {
    const row = await firstRow<ExternalProfileRow>(
      db
        .prepare('SELECT * FROM creator_external_profiles WHERE normalized_profile_url = ? LIMIT 1')
        .bind(normalizedProfileUrl),
      'externalProfile.findByNormalizedProfileUrl',
    );
    return row ? mapProfile(row) : null;
  }

  async function checkConflicts(
    input: ExternalProfileWriteInput,
    excludeId: string | null = null,
  ): Promise<ExternalProfileConflict[]> {
    const prepared = prepareInput(input);
    const rows = await allRows<ExternalProfileRow>(
      db
        .prepare(
          `SELECT * FROM creator_external_profiles WHERE id <> COALESCE(?, '') AND (
             (? IS NOT NULL AND platform = ? AND platform_account_id = ?)
             OR (? IS NOT NULL AND normalized_profile_url = ?)
             OR (? = 1 AND creator_entity_id = ? AND platform = ? AND is_primary = 1)
           ) ORDER BY created_at, id`,
        )
        .bind(
          excludeId,
          prepared.platformAccountId,
          prepared.platform,
          prepared.platformAccountId,
          prepared.normalizedUrl,
          prepared.normalizedUrl,
          prepared.isPrimary ? 1 : 0,
          prepared.creatorEntityId,
          prepared.platform,
        ),
      'externalProfile.checkConflicts',
    );
    return rows.flatMap((row): ExternalProfileConflict[] => {
      const conflicts: ExternalProfileConflict[] = [];
      if (
        prepared.platformAccountId &&
        row.platform === prepared.platform &&
        row.platform_account_id === prepared.platformAccountId
      ) {
        conflicts.push({
          type:
            row.creator_entity_id === prepared.creatorEntityId
              ? 'source_association'
              : 'stable_account',
          profileId: row.id,
          creatorEntityId: row.creator_entity_id,
        });
      }
      if (prepared.normalizedUrl && row.normalized_profile_url === prepared.normalizedUrl) {
        conflicts.push({
          type:
            row.creator_entity_id === prepared.creatorEntityId
              ? 'source_association'
              : 'profile_url',
          profileId: row.id,
          creatorEntityId: row.creator_entity_id,
        });
      }
      if (
        prepared.isPrimary &&
        row.creator_entity_id === prepared.creatorEntityId &&
        row.platform === prepared.platform &&
        row.is_primary === 1
      ) {
        conflicts.push({
          type: 'primary_profile',
          profileId: row.id,
          creatorEntityId: row.creator_entity_id,
        });
      }
      return conflicts;
    });
  }

  async function create(input: ExternalProfileWriteInput): Promise<CreatorExternalProfile> {
    const prepared = prepareInput(input);
    const conflicts = (await checkConflicts(input)).filter(
      (conflict) => conflict.type !== 'primary_profile',
    );
    if (conflicts.length > 0) {
      throw createInvalidInputError('The external profile conflicts with an existing association.');
    }
    const id = metadata.createId();
    const timestamp = metadata.now();
    const insert = db
      .prepare(
        `INSERT INTO creator_external_profiles (
            id, creator_entity_id, platform, platform_account_id, platform_handle,
            normalized_platform_handle, profile_url, normalized_profile_url, profile_name,
            is_primary, verification_status, visibility_status, source_name, source_reference,
            source_license, confidence_score, connector_version, mapping_version, first_seen_at,
            last_seen_at, last_verified_at, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        prepared.creatorEntityId,
        prepared.platform,
        prepared.platformAccountId,
        prepared.platformHandle,
        prepared.normalizedHandle,
        prepared.profileUrl,
        prepared.normalizedUrl,
        prepared.profileName,
        prepared.isPrimary ? 1 : 0,
        prepared.verificationStatus,
        prepared.visibilityStatus,
        prepared.sourceName,
        prepared.sourceReference,
        prepared.sourceLicense,
        prepared.confidenceScore,
        prepared.connectorVersion,
        prepared.mappingVersion,
        prepared.firstSeenAt ?? timestamp,
        prepared.lastSeenAt ?? timestamp,
        prepared.lastVerifiedAt ?? null,
        timestamp,
        timestamp,
      );
    await withDatabaseErrorMapping('externalProfile.create', () =>
      prepared.isPrimary
        ? db.batch([
            db
              .prepare(
                `UPDATE creator_external_profiles SET is_primary = 0, updated_at = ?
                 WHERE creator_entity_id = ? AND platform = ?`,
              )
              .bind(timestamp, prepared.creatorEntityId, prepared.platform),
            insert,
          ])
        : db.batch([insert]),
    );
    const created = await findById(id);
    if (!created) throw createNotFoundError('external profile', id);
    return created;
  }

  async function update(
    id: string,
    input: ExternalProfileWriteInput,
  ): Promise<CreatorExternalProfile> {
    const current = await findById(id);
    if (!current) throw createNotFoundError('external profile', id);
    const prepared = prepareInput(input);
    const conflicts = (await checkConflicts(input, id)).filter(
      (conflict) => conflict.type !== 'primary_profile',
    );
    if (conflicts.length > 0) {
      throw createInvalidInputError('The external profile conflicts with an existing association.');
    }
    const timestamp = metadata.now();
    const updateStatement = db
      .prepare(
        `UPDATE creator_external_profiles SET creator_entity_id = ?, platform = ?,
           platform_account_id = ?, platform_handle = ?, normalized_platform_handle = ?,
           profile_url = ?, normalized_profile_url = ?, profile_name = ?, is_primary = ?,
           verification_status = ?, visibility_status = ?, source_name = ?, source_reference = ?,
           source_license = ?, confidence_score = ?, connector_version = ?, mapping_version = ?,
           last_seen_at = ?, last_verified_at = ?, updated_at = ? WHERE id = ?`,
      )
      .bind(
        prepared.creatorEntityId,
        prepared.platform,
        prepared.platformAccountId,
        prepared.platformHandle,
        prepared.normalizedHandle,
        prepared.profileUrl,
        prepared.normalizedUrl,
        prepared.profileName,
        prepared.isPrimary ? 1 : 0,
        prepared.verificationStatus,
        prepared.visibilityStatus,
        prepared.sourceName,
        prepared.sourceReference,
        prepared.sourceLicense,
        prepared.confidenceScore,
        prepared.connectorVersion,
        prepared.mappingVersion,
        prepared.lastSeenAt ?? metadata.now(),
        prepared.lastVerifiedAt ?? null,
        timestamp,
        id,
      );
    if (prepared.isPrimary) {
      await withDatabaseErrorMapping('externalProfile.update', () =>
        db.batch([
          db
            .prepare(
              `UPDATE creator_external_profiles SET is_primary = 0, updated_at = ?
               WHERE creator_entity_id = ? AND platform = ? AND id <> ?`,
            )
            .bind(timestamp, prepared.creatorEntityId, prepared.platform, id),
          updateStatement,
        ]),
      );
    } else {
      await runStatement(updateStatement, 'externalProfile.update');
    }
    const updated = await findById(id);
    if (!updated) throw createNotFoundError('external profile', id);
    return updated;
  }

  async function updateVerificationStatus(
    id: string,
    status: ExternalProfileVerificationStatus,
  ): Promise<CreatorExternalProfile> {
    const result = await runStatement(
      db
        .prepare(
          'UPDATE creator_external_profiles SET verification_status = ?, updated_at = ? WHERE id = ?',
        )
        .bind(status, metadata.now(), id),
      'externalProfile.updateVerificationStatus',
    );
    if ((result.meta.changes ?? 0) === 0) throw createNotFoundError('external profile', id);
    const updated = await findById(id);
    if (!updated) throw createNotFoundError('external profile', id);
    return updated;
  }

  async function updateVisibilityStatus(
    id: string,
    status: ExternalProfileVisibilityStatus,
  ): Promise<CreatorExternalProfile> {
    const result = await runStatement(
      db
        .prepare(
          'UPDATE creator_external_profiles SET visibility_status = ?, updated_at = ? WHERE id = ?',
        )
        .bind(status, metadata.now(), id),
      'externalProfile.updateVisibilityStatus',
    );
    if ((result.meta.changes ?? 0) === 0) throw createNotFoundError('external profile', id);
    const updated = await findById(id);
    if (!updated) throw createNotFoundError('external profile', id);
    return updated;
  }

  async function setPrimary(id: string): Promise<CreatorExternalProfile> {
    const current = await findById(id);
    if (!current) throw createNotFoundError('external profile', id);
    await withDatabaseErrorMapping('externalProfile.setPrimary', () =>
      db.batch([
        db
          .prepare(
            `UPDATE creator_external_profiles SET is_primary = 0, updated_at = ?
             WHERE creator_entity_id = ? AND platform = ? AND id <> ?`,
          )
          .bind(metadata.now(), current.creatorEntityId, current.platform, id),
        db
          .prepare(
            'UPDATE creator_external_profiles SET is_primary = 1, updated_at = ? WHERE id = ?',
          )
          .bind(metadata.now(), id),
      ]),
    );
    const updated = await findById(id);
    if (!updated) throw createNotFoundError('external profile', id);
    return updated;
  }

  async function deactivate(id: string): Promise<CreatorExternalProfile> {
    const result = await runStatement(
      db
        .prepare(
          `UPDATE creator_external_profiles SET visibility_status = 'suppressed', is_primary = 0,
           updated_at = ? WHERE id = ?`,
        )
        .bind(metadata.now(), id),
      'externalProfile.deactivate',
    );
    if ((result.meta.changes ?? 0) === 0) throw createNotFoundError('external profile', id);
    const updated = await findById(id);
    if (!updated) throw createNotFoundError('external profile', id);
    return updated;
  }

  return {
    create,
    findById,
    listByCreator,
    listPublicByCreator,
    findByPlatformAccountId,
    findByNormalizedProfileUrl,
    update,
    updateVerificationStatus,
    updateVisibilityStatus,
    setPrimary,
    deactivate,
    checkConflicts,
  };
}
