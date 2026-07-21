import type {
  ApprovalActionType,
  ApprovalRequestStatus,
} from '@open-creator-registry/contracts/admin';

import { createInvalidInputError, createNotFoundError, withDatabaseErrorMapping } from '../errors';
import { parseJson, serializeJson, type JsonValue } from '../json';
import type {
  AdminApprovalDecision,
  AdminApprovalRequest,
  PaginatedResult,
  Pagination,
} from '../models';
import { defaultRecordMetadataProvider, type RecordMetadataProvider } from '../runtime';
import { allRows, firstRow, resolvePagination } from './shared';

type ApprovalRequestRow = {
  id: string;
  action_type: ApprovalActionType;
  entity_type: string;
  entity_id: string | null;
  requested_by: string;
  requested_payload: string;
  reason: string;
  status: ApprovalRequestStatus;
  required_approvals: number;
  approval_count: number;
  target_revision: string | null;
  expires_at: string;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  applied_at: string | null;
};

type ApprovalDecisionRow = {
  id: string;
  approval_request_id: string;
  administrator_identifier: string;
  decision: 'approved' | 'rejected';
  reason: string;
  created_at: string;
};

function mapRequest(row: ApprovalRequestRow): AdminApprovalRequest {
  return {
    id: row.id,
    actionType: row.action_type,
    entityType: row.entity_type,
    entityId: row.entity_id,
    requestedBy: row.requested_by,
    requestedPayload: parseJson(row.requested_payload, 'admin approval requested_payload'),
    reason: row.reason,
    status: row.status,
    requiredApprovals: row.required_approvals,
    approvalCount: row.approval_count,
    targetRevision: row.target_revision,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    resolvedAt: row.resolved_at,
    appliedAt: row.applied_at,
  };
}

function mapDecision(row: ApprovalDecisionRow): AdminApprovalDecision {
  return {
    id: row.id,
    approvalRequestId: row.approval_request_id,
    administratorIdentifier: row.administrator_identifier,
    decision: row.decision,
    reason: row.reason,
    createdAt: row.created_at,
  };
}

export type CreateApprovalRequestInput = {
  actionType: ApprovalActionType;
  entityType: string;
  entityId?: string | null;
  requestedBy: string;
  requestedPayload: JsonValue;
  reason: string;
  targetRevision?: string | null;
  expiresAt: string;
  requestId: string;
};

export type ApprovalRequestListOptions = Pagination & {
  status?: ApprovalRequestStatus;
  actionType?: ApprovalActionType;
  entityType?: string;
  entityId?: string;
};

export type CriticalHandlePayload = {
  id: string;
  creatorEntityId: string;
  displayHandle: string;
  normalizedHandle: string;
  confusableSkeleton: string;
  classification: 'hard_reserved' | 'soft_protected' | 'monitored' | 'not_listed';
  confidenceScore: number;
  decisionSource: string;
  reason: string;
  status: 'active' | 'suspended' | 'released' | 'disputed';
};

export function createAdminApprovalRepository(
  db: D1Database,
  metadata: RecordMetadataProvider = defaultRecordMetadataProvider,
) {
  async function findById(id: string): Promise<AdminApprovalRequest | null> {
    const row = await firstRow<ApprovalRequestRow>(
      db.prepare('SELECT * FROM admin_approval_requests WHERE id = ? LIMIT 1').bind(id),
      'adminApproval.findById',
    );
    return row ? mapRequest(row) : null;
  }

  async function create(input: CreateApprovalRequestInput): Promise<AdminApprovalRequest> {
    const id = metadata.createId();
    const auditId = metadata.createId();
    const timestamp = metadata.now();
    await withDatabaseErrorMapping('adminApproval.create', () =>
      db.batch([
        db
          .prepare(
            `INSERT INTO admin_approval_requests (
              id, action_type, entity_type, entity_id, requested_by, requested_payload, reason,
              status, required_approvals, approval_count, target_revision, expires_at, created_at,
              updated_at, resolved_at, applied_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', 1, 0, ?, ?, ?, ?, NULL, NULL)`,
          )
          .bind(
            id,
            input.actionType,
            input.entityType,
            input.entityId ?? null,
            input.requestedBy,
            serializeJson(input.requestedPayload),
            input.reason,
            input.targetRevision ?? null,
            input.expiresAt,
            timestamp,
            timestamp,
          ),
        db
          .prepare(
            `INSERT INTO audit_logs (
              id, action, entity_type, entity_id, actor_identifier, previous_value, new_value,
              metadata, created_at
            ) VALUES (?, 'approval.requested', 'admin_approval_request', ?, ?, NULL, ?, ?, ?)`,
          )
          .bind(
            auditId,
            id,
            input.requestedBy,
            serializeJson({ action_type: input.actionType, reason: input.reason }),
            serializeJson({ request_id: input.requestId }),
            timestamp,
          ),
      ]),
    );
    const created = await findById(id);
    if (!created) throw createNotFoundError('admin approval request', id);
    return created;
  }

  async function list(
    options: ApprovalRequestListOptions = {},
  ): Promise<PaginatedResult<AdminApprovalRequest>> {
    const { page, limit, offset } = resolvePagination(options);
    const rows = await allRows<ApprovalRequestRow>(
      db
        .prepare(
          `SELECT * FROM admin_approval_requests
           WHERE (? IS NULL OR status = ?) AND (? IS NULL OR action_type = ?)
             AND (? IS NULL OR entity_type = ?) AND (? IS NULL OR entity_id = ?)
           ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
        )
        .bind(
          options.status ?? null,
          options.status ?? null,
          options.actionType ?? null,
          options.actionType ?? null,
          options.entityType ?? null,
          options.entityType ?? null,
          options.entityId ?? null,
          options.entityId ?? null,
          limit,
          offset,
        ),
      'adminApproval.list',
    );
    return { items: rows.map(mapRequest), page, limit };
  }

  async function count(options: Omit<ApprovalRequestListOptions, keyof Pagination> = {}) {
    const row = await firstRow<{ count: number }>(
      db
        .prepare(
          `SELECT COUNT(*) AS count FROM admin_approval_requests
           WHERE (? IS NULL OR status = ?) AND (? IS NULL OR action_type = ?)
             AND (? IS NULL OR entity_type = ?) AND (? IS NULL OR entity_id = ?)`,
        )
        .bind(
          options.status ?? null,
          options.status ?? null,
          options.actionType ?? null,
          options.actionType ?? null,
          options.entityType ?? null,
          options.entityType ?? null,
          options.entityId ?? null,
          options.entityId ?? null,
        ),
      'adminApproval.count',
    );
    return row?.count ?? 0;
  }

  async function listDecisions(approvalRequestId: string): Promise<AdminApprovalDecision[]> {
    const rows = await allRows<ApprovalDecisionRow>(
      db
        .prepare(
          `SELECT * FROM admin_approval_decisions WHERE approval_request_id = ?
           ORDER BY created_at, id`,
        )
        .bind(approvalRequestId),
      'adminApproval.listDecisions',
    );
    return rows.map(mapDecision);
  }

  async function reject(
    id: string,
    administratorIdentifier: string,
    reason: string,
    requestId: string,
  ): Promise<AdminApprovalRequest> {
    const current = await findById(id);
    if (!current) throw createNotFoundError('admin approval request', id);
    if (current.requestedBy === administratorIdentifier) {
      throw createInvalidInputError('The requester cannot decide their own approval request.');
    }
    const timestamp = metadata.now();
    if (current.status !== 'pending' || current.expiresAt <= timestamp) {
      throw createInvalidInputError('Only a current pending approval request can be rejected.');
    }
    const guardId = metadata.createId();
    await withDatabaseErrorMapping('adminApproval.reject', () =>
      db.batch([
        db
          .prepare(
            `INSERT INTO admin_mutation_guards (id, valid)
             VALUES (?, (SELECT COUNT(*) FROM admin_approval_requests
               WHERE id = ? AND status = 'pending' AND requested_by <> ? AND expires_at > ?))`,
          )
          .bind(guardId, id, administratorIdentifier, timestamp),
        db
          .prepare(
            `INSERT INTO admin_approval_decisions (
              id, approval_request_id, administrator_identifier, decision, reason, created_at
            ) VALUES (?, ?, ?, 'rejected', ?, ?)`,
          )
          .bind(metadata.createId(), id, administratorIdentifier, reason, timestamp),
        db
          .prepare(
            `UPDATE admin_approval_requests SET status = 'rejected', resolved_at = ?, updated_at = ?
             WHERE id = ? AND status = 'pending'`,
          )
          .bind(timestamp, timestamp, id),
        db
          .prepare(
            `INSERT INTO audit_logs (
              id, action, entity_type, entity_id, actor_identifier, previous_value, new_value,
              metadata, created_at
            ) VALUES (?, 'approval.rejected', 'admin_approval_request', ?, ?, NULL, ?, ?, ?)`,
          )
          .bind(
            metadata.createId(),
            id,
            administratorIdentifier,
            serializeJson({ status: 'rejected', reason }),
            serializeJson({ request_id: requestId }),
            timestamp,
          ),
        db.prepare('DELETE FROM admin_mutation_guards WHERE id = ?').bind(guardId),
      ]),
    );
    const rejected = await findById(id);
    if (!rejected) throw createNotFoundError('admin approval request', id);
    return rejected;
  }

  function commonApplyStatements(
    current: AdminApprovalRequest,
    administratorIdentifier: string,
    reason: string,
    requestId: string,
    timestamp: string,
    action: string,
    newValue: JsonValue,
  ) {
    const guardId = metadata.createId();
    return {
      guardId,
      leading: [
        db
          .prepare(
            `INSERT INTO admin_mutation_guards (id, valid)
             VALUES (?, (SELECT COUNT(*) FROM admin_approval_requests
               WHERE id = ? AND status = 'pending' AND requested_by <> ? AND expires_at > ?))`,
          )
          .bind(guardId, current.id, administratorIdentifier, timestamp),
        db
          .prepare(
            `INSERT INTO admin_approval_decisions (
              id, approval_request_id, administrator_identifier, decision, reason, created_at
            ) VALUES (?, ?, ?, 'approved', ?, ?)`,
          )
          .bind(metadata.createId(), current.id, administratorIdentifier, reason, timestamp),
      ],
      trailing: [
        db
          .prepare(
            `UPDATE admin_approval_requests SET status = 'applied', approval_count = 1,
             resolved_at = ?, applied_at = ?, updated_at = ? WHERE id = ? AND status = 'pending'`,
          )
          .bind(timestamp, timestamp, timestamp, current.id),
        db
          .prepare(
            `INSERT INTO audit_logs (
              id, action, entity_type, entity_id, actor_identifier, previous_value, new_value,
              metadata, created_at
            ) VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?)`,
          )
          .bind(
            metadata.createId(),
            action,
            current.entityType,
            current.entityId,
            administratorIdentifier,
            serializeJson(newValue),
            serializeJson({ approval_request_id: current.id, request_id: requestId }),
            timestamp,
          ),
        db.prepare('DELETE FROM admin_mutation_guards WHERE id = ?').bind(guardId),
      ],
    };
  }

  async function applyHandle(
    current: AdminApprovalRequest,
    payload: CriticalHandlePayload,
    administratorIdentifier: string,
    reason: string,
    requestId: string,
  ): Promise<AdminApprovalRequest> {
    const timestamp = metadata.now();
    if (current.requestedBy === administratorIdentifier) {
      throw createInvalidInputError('The requester cannot approve their own approval request.');
    }
    if (current.status !== 'pending' || current.expiresAt <= timestamp) {
      throw createInvalidInputError('Only a current pending approval request can be approved.');
    }
    const common = commonApplyStatements(
      current,
      administratorIdentifier,
      reason,
      requestId,
      timestamp,
      current.actionType,
      payload,
    );
    const targetGuardId = metadata.createId();
    const targetGuard =
      current.actionType === 'handle.create_critical'
        ? db.prepare('SELECT 1')
        : db
            .prepare(
              `INSERT INTO admin_mutation_guards (id, valid)
               VALUES (?, (SELECT COUNT(*) FROM reserved_handles WHERE id = ? AND updated_at = ?))`,
            )
            .bind(targetGuardId, payload.id, current.targetRevision);
    const mutation =
      current.actionType === 'handle.create_critical'
        ? db
            .prepare(
              `INSERT INTO reserved_handles (
                id, creator_entity_id, display_handle, normalized_handle, confusable_skeleton,
                classification, confidence_score, decision_source, reason, status, created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            )
            .bind(
              payload.id,
              payload.creatorEntityId,
              payload.displayHandle,
              payload.normalizedHandle,
              payload.confusableSkeleton,
              payload.classification,
              payload.confidenceScore,
              payload.decisionSource,
              payload.reason,
              payload.status,
              timestamp,
              timestamp,
            )
        : db
            .prepare(
              `UPDATE reserved_handles SET creator_entity_id = ?, display_handle = ?,
               normalized_handle = ?, confusable_skeleton = ?, classification = ?, confidence_score = ?,
               decision_source = ?, reason = ?, status = ?, updated_at = ? WHERE id = ? AND updated_at = ?`,
            )
            .bind(
              payload.creatorEntityId,
              payload.displayHandle,
              payload.normalizedHandle,
              payload.confusableSkeleton,
              payload.classification,
              payload.confidenceScore,
              payload.decisionSource,
              payload.reason,
              payload.status,
              timestamp,
              payload.id,
              current.targetRevision,
            );
    await withDatabaseErrorMapping('adminApproval.applyHandle', () =>
      db.batch([
        ...common.leading,
        targetGuard,
        mutation,
        ...common.trailing,
        ...(current.actionType === 'handle.create_critical'
          ? []
          : [db.prepare('DELETE FROM admin_mutation_guards WHERE id = ?').bind(targetGuardId)]),
      ]),
    );
    const applied = await findById(current.id);
    if (!applied) throw createNotFoundError('admin approval request', current.id);
    return applied;
  }

  async function approveRelease(
    current: AdminApprovalRequest,
    administratorIdentifier: string,
    reason: string,
    requestId: string,
  ): Promise<AdminApprovalRequest> {
    const timestamp = metadata.now();
    if (current.requestedBy === administratorIdentifier) {
      throw createInvalidInputError('The requester cannot approve their own approval request.');
    }
    const guardId = metadata.createId();
    await withDatabaseErrorMapping('adminApproval.approveRelease', () =>
      db.batch([
        db
          .prepare(
            `INSERT INTO admin_mutation_guards (id, valid)
             VALUES (?, (SELECT COUNT(*) FROM admin_approval_requests
               WHERE id = ? AND status = 'pending' AND requested_by <> ? AND expires_at > ?))`,
          )
          .bind(guardId, current.id, administratorIdentifier, timestamp),
        db
          .prepare(
            `INSERT INTO admin_approval_decisions (
              id, approval_request_id, administrator_identifier, decision, reason, created_at
            ) VALUES (?, ?, ?, 'approved', ?, ?)`,
          )
          .bind(metadata.createId(), current.id, administratorIdentifier, reason, timestamp),
        db
          .prepare(
            `UPDATE admin_approval_requests SET status = 'approved', approval_count = 1,
             resolved_at = ?, updated_at = ? WHERE id = ? AND status = 'pending'`,
          )
          .bind(timestamp, timestamp, current.id),
        db
          .prepare(
            `INSERT INTO audit_logs (
              id, action, entity_type, entity_id, actor_identifier, previous_value, new_value,
              metadata, created_at
            ) VALUES (?, 'approval.approved', 'admin_approval_request', ?, ?, NULL, ?, ?, ?)`,
          )
          .bind(
            metadata.createId(),
            current.id,
            administratorIdentifier,
            serializeJson({ status: 'approved', reason }),
            serializeJson({ request_id: requestId }),
            timestamp,
          ),
        db.prepare('DELETE FROM admin_mutation_guards WHERE id = ?').bind(guardId),
      ]),
    );
    const applied = await findById(current.id);
    if (!applied) throw createNotFoundError('admin approval request', current.id);
    return applied;
  }

  async function publishApprovedRelease(
    current: AdminApprovalRequest,
    payload: { releaseId: string; checksum: string; updatedAt: string },
    administratorIdentifier: string,
    requestId: string,
  ): Promise<AdminApprovalRequest> {
    const timestamp = metadata.now();
    const guardId = metadata.createId();
    const releaseGuardId = metadata.createId();
    await withDatabaseErrorMapping('adminApproval.publishApprovedRelease', () =>
      db.batch([
        db
          .prepare(
            `INSERT INTO admin_mutation_guards (id, valid)
             VALUES (?, (SELECT COUNT(*) FROM admin_approval_requests
               WHERE id = ? AND status = 'approved' AND approval_count >= required_approvals
                 AND expires_at > ?))`,
          )
          .bind(guardId, current.id, timestamp),
        db
          .prepare(
            `INSERT INTO admin_mutation_guards (id, valid)
             VALUES (?, (SELECT COUNT(*) FROM registry_releases release
               JOIN registry_release_snapshots snapshot ON snapshot.registry_release_id = release.id
               WHERE release.id = ? AND release.release_status = 'draft' AND release.updated_at = ?
                 AND release.checksum = ? AND snapshot.checksum = ?))`,
          )
          .bind(
            releaseGuardId,
            payload.releaseId,
            payload.updatedAt,
            payload.checksum,
            payload.checksum,
          ),
        db
          .prepare(
            `UPDATE registry_releases SET release_status = 'superseded', updated_at = ?
             WHERE release_status = 'published' AND id <> ?`,
          )
          .bind(timestamp, payload.releaseId),
        db
          .prepare(
            `UPDATE registry_releases SET release_status = 'published', published_at = ?, updated_at = ?
             WHERE id = ? AND release_status = 'draft' AND updated_at = ? AND checksum = ?`,
          )
          .bind(timestamp, timestamp, payload.releaseId, payload.updatedAt, payload.checksum),
        db
          .prepare(
            `UPDATE admin_approval_requests SET status = 'applied', applied_at = ?, updated_at = ?
             WHERE id = ? AND status = 'approved'`,
          )
          .bind(timestamp, timestamp, current.id),
        db
          .prepare(
            `INSERT INTO audit_logs (
              id, action, entity_type, entity_id, actor_identifier, previous_value, new_value,
              metadata, created_at
            ) VALUES (?, 'release.publish', 'registry_release', ?, ?, NULL, ?, ?, ?)`,
          )
          .bind(
            metadata.createId(),
            payload.releaseId,
            administratorIdentifier,
            serializeJson({ status: 'published', checksum: payload.checksum }),
            serializeJson({ approval_request_id: current.id, request_id: requestId }),
            timestamp,
          ),
        db.prepare('DELETE FROM admin_mutation_guards WHERE id = ?').bind(guardId),
        db.prepare('DELETE FROM admin_mutation_guards WHERE id = ?').bind(releaseGuardId),
      ]),
    );
    const applied = await findById(current.id);
    if (!applied) throw createNotFoundError('admin approval request', current.id);
    return applied;
  }

  return {
    create,
    findById,
    list,
    count,
    listDecisions,
    reject,
    applyHandle,
    approveRelease,
    publishApprovedRelease,
  };
}
