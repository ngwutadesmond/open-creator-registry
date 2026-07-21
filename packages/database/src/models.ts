import type {
  ApprovalActionType,
  ApprovalDecision,
  ApprovalRequestStatus,
  ImportBatchStatus,
  ImportFormat,
} from '@open-creator-registry/contracts/admin';
import type { RegistryClassification } from '@open-creator-registry/contracts/classifications';
import type {
  AliasType,
  CandidateStatus,
  CreatorProtectionTier,
  CreatorReviewStatus,
  IngestionStatus,
  RegistryReleaseStatus,
  ReservationStatus,
  SourceVerificationStatus,
  SubmissionStatus,
} from '@open-creator-registry/contracts/domain';

import type { JsonValue } from './json';

export type CreatorEntity = {
  id: string;
  canonicalName: string;
  normalizedName: string;
  entityType: string;
  primaryCategory: string | null;
  countryCodes: string[] | null;
  biographySummary: string | null;
  notorietyScore: number;
  protectionTier: CreatorProtectionTier;
  reviewStatus: CreatorReviewStatus;
  createdAt: string;
  updatedAt: string;
};

export type CreatorAlias = {
  id: string;
  creatorEntityId: string;
  alias: string;
  normalizedAlias: string;
  confusableSkeleton: string;
  language: string | null;
  aliasType: AliasType;
  confidenceScore: number;
  sourceId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreatorSource = {
  id: string;
  creatorEntityId: string;
  sourceName: string;
  sourceEntityId: string;
  sourceUrl: string | null;
  sourceLicense: string | null;
  verificationStatus: SourceVerificationStatus;
  lastCheckedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ReservedHandle = {
  id: string;
  creatorEntityId: string;
  displayHandle: string;
  normalizedHandle: string;
  confusableSkeleton: string;
  classification: RegistryClassification;
  confidenceScore: number;
  decisionSource: string;
  reason: string;
  status: ReservationStatus;
  createdAt: string;
  updatedAt: string;
};

export type CreatorCandidate = {
  id: string;
  canonicalName: string;
  normalizedName: string;
  category: string | null;
  countryCodes: string[] | null;
  discoverySource: string;
  confidenceScore: number;
  reviewStatus: CandidateStatus;
  discoveredAt: string;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PublicSubmission = {
  id: string;
  creatorName: string;
  category: string | null;
  countryCodes: string[] | null;
  requestedHandles: string[];
  publicSources: string[];
  submissionStatus: SubmissionStatus;
  createdAt: string;
  reviewedAt: string | null;
  updatedAt: string;
};

export type RegistryRelease = {
  id: string;
  version: string;
  recordCount: number;
  checksum: string;
  releaseStatus: RegistryReleaseStatus;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type IngestionRun = {
  id: string;
  sourceName: string;
  status: IngestionStatus;
  importedCount: number;
  updatedCount: number;
  skippedCount: number;
  failedCount: number;
  errorSummary: string | null;
  startedAt: string;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AuditLog = {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  actorIdentifier: string;
  previousValue: JsonValue | null;
  newValue: JsonValue | null;
  metadata: JsonValue | null;
  createdAt: string;
};

export type AdminApprovalRequest = {
  id: string;
  actionType: ApprovalActionType;
  entityType: string;
  entityId: string | null;
  requestedBy: string;
  requestedPayload: JsonValue;
  reason: string;
  status: ApprovalRequestStatus;
  requiredApprovals: number;
  approvalCount: number;
  targetRevision: string | null;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  appliedAt: string | null;
};

export type AdminApprovalDecision = {
  id: string;
  approvalRequestId: string;
  administratorIdentifier: string;
  decision: ApprovalDecision;
  reason: string;
  createdAt: string;
};

export type ImportBatch = {
  id: string;
  format: ImportFormat;
  fileName: string;
  checksum: string;
  status: ImportBatchStatus;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  duplicateRows: number;
  warningRows: number;
  validatedPayload: JsonValue;
  summary: JsonValue | null;
  createdBy: string;
  committedBy: string | null;
  createdAt: string;
  committedAt: string | null;
  completedAt: string | null;
  updatedAt: string;
};

export type ImportBatchError = {
  id: string;
  importBatchId: string;
  rowNumber: number;
  errorCode: string;
  errorMessage: string;
  fieldName: string | null;
  rawValue: string | null;
  createdAt: string;
};

export type RegistryReleaseSnapshot = {
  id: string;
  registryReleaseId: string;
  snapshot: JsonValue;
  creatorCount: number;
  activeHandleCount: number;
  hardReservedCount: number;
  softProtectedCount: number;
  monitoredCount: number;
  checksum: string;
  createdBy: string;
  generatedAt: string;
};

export type Pagination = {
  page?: number;
  limit?: number;
};

export type PaginatedResult<T> = {
  items: T[];
  page: number;
  limit: number;
};
