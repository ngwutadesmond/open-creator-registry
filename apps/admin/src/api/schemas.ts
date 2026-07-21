import { z } from '@hono/zod-openapi';

import {
  approvalActionTypes,
  approvalRequestStatuses,
  importBatchStatuses,
  importFormats,
} from '@open-creator-registry/contracts/admin';
import { registryClassifications } from '@open-creator-registry/contracts/classifications';
import {
  aliasTypes,
  candidateStatuses,
  creatorProtectionTiers,
  creatorReviewStatuses,
  ingestionStatuses,
  registryReleaseStatuses,
  reservationStatuses,
  sourceVerificationStatuses,
  submissionStatuses,
} from '@open-creator-registry/contracts/domain';

export const idParamsSchema = z.object({ id: z.string().uuid() });
export const creatorIdParamsSchema = z.object({ creatorId: z.string().uuid() });
export const aliasIdParamsSchema = z.object({ aliasId: z.string().uuid() });
export const sourceIdParamsSchema = z.object({ sourceId: z.string().uuid() });
export const handleIdParamsSchema = z.object({ handleId: z.string().uuid() });
export const candidateIdParamsSchema = z.object({ candidateId: z.string().uuid() });
export const submissionIdParamsSchema = z.object({ submissionId: z.string().uuid() });
export const importIdParamsSchema = z.object({ importId: z.string().uuid() });
export const runIdParamsSchema = z.object({ runId: z.string().uuid() });
export const releaseIdParamsSchema = z.object({ releaseId: z.string().uuid() });
export const approvalIdParamsSchema = z.object({ approvalId: z.string().uuid() });
export const auditLogIdParamsSchema = z.object({ auditLogId: z.string().uuid() });

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

const countryCodeSchema = z
  .string()
  .regex(/^[A-Z]{2}$/u, 'Use ISO 3166-1 alpha-2 uppercase codes.');

export const creatorInputSchema = z.object({
  canonical_name: z.string().trim().min(2).max(160),
  entity_type: z.string().trim().min(2).max(80),
  primary_category: z.string().trim().min(2).max(80).nullable().optional(),
  country_codes: z.array(countryCodeSchema).max(20).nullable().optional(),
  biography_summary: z.string().trim().max(2_000).nullable().optional(),
  notoriety_score: z.number().int().min(0).max(100).default(0),
  protection_tier: z.enum(creatorProtectionTiers),
  review_status: z.enum(creatorReviewStatuses),
  allow_common_name_duplicate: z.boolean().default(false),
});

export const creatorPatchSchema = creatorInputSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required.');

export const creatorListQuerySchema = paginationQuerySchema.extend({
  query: z.string().trim().max(160).optional(),
  category: z.string().trim().max(80).optional(),
  country: countryCodeSchema.optional(),
  protection_tier: z.enum(creatorProtectionTiers).optional(),
  review_status: z.enum(creatorReviewStatuses).optional(),
  sort: z
    .enum(['canonical_name', 'created_at', 'notoriety_score', 'updated_at'])
    .default('updated_at'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

export const aliasInputSchema = z.object({
  alias: z.string().trim().min(2).max(80),
  language: z.string().trim().min(2).max(35).nullable().optional(),
  alias_type: z.enum(aliasTypes),
  confidence_score: z.number().int().min(0).max(100),
  source_id: z.string().uuid().nullable().optional(),
});
export const aliasPatchSchema = aliasInputSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required.');

const publicUrlSchema = z
  .string()
  .url()
  .refine(
    (value) => ['http:', 'https:'].includes(new URL(value).protocol),
    'Only http and https URLs are supported.',
  );
export const sourceInputSchema = z.object({
  source_name: z.string().trim().min(2).max(100),
  source_entity_id: z.string().trim().min(1).max(200),
  source_url: publicUrlSchema.nullable().optional(),
  source_license: z.string().trim().max(160).nullable().optional(),
  verification_status: z.enum(sourceVerificationStatuses),
  last_checked_at: z.string().datetime().nullable().optional(),
});
export const sourcePatchSchema = sourceInputSchema
  .omit({ source_name: true, source_entity_id: true })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required.');

export const handleInputSchema = z.object({
  creator_entity_id: z.string().uuid(),
  display_handle: z.string().trim().min(2).max(80),
  classification: z.enum(registryClassifications),
  confidence_score: z.number().int().min(0).max(100),
  decision_source: z.string().trim().min(2).max(160),
  reason: z.string().trim().min(10).max(2_000),
  status: z.enum(reservationStatuses).default('active'),
});
export const handlePatchSchema = handleInputSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required.');
export const handleListQuerySchema = paginationQuerySchema.extend({
  query: z.string().trim().max(80).optional(),
  creator_id: z.string().uuid().optional(),
  creator_tier: z.enum(creatorProtectionTiers).optional(),
  classification: z.enum(registryClassifications).optional(),
  status: z.enum(reservationStatuses).optional(),
});
export const conflictCheckSchema = z.object({
  handle: z.string().trim().min(1).max(80),
  creator_entity_id: z.string().uuid().optional(),
});

export const candidateListQuerySchema = paginationQuerySchema.extend({
  query: z.string().trim().max(160).optional(),
  status: z.enum(candidateStatuses).optional(),
  category: z.string().trim().max(80).optional(),
});
export const candidateApproveSchema = z.object({
  reason: z.string().trim().min(3).max(500),
  create_creator_draft: z.boolean().default(true),
});
export const candidateDecisionSchema = z.object({ reason: z.string().trim().min(3).max(500) });
export const candidateMergeSchema = candidateDecisionSchema.extend({
  target_creator_id: z.string().uuid(),
});

export const submissionListQuerySchema = paginationQuerySchema.extend({
  status: z.enum(submissionStatuses).optional(),
});
export const reviewDecisionSchema = z.object({ reason: z.string().trim().min(3).max(500) });

export const importPreviewSchema = z.object({
  format: z.enum(importFormats),
  file_name: z.string().trim().min(1).max(160),
  content: z.string().min(2).max(262_144),
});
export const importCommitSchema = z.object({
  import_id: z.string().uuid(),
  checksum: z.string().regex(/^[a-f0-9]{64}$/u),
});
export const importListQuerySchema = paginationQuerySchema.extend({
  status: z.enum(importBatchStatuses).optional(),
});

export const ingestionListQuerySchema = paginationQuerySchema.extend({
  status: z.enum(ingestionStatuses).optional(),
  source_name: z.string().trim().max(160).optional(),
});
export const releaseListQuerySchema = paginationQuerySchema.extend({
  status: z.enum(registryReleaseStatuses).optional(),
});
export const releaseCreateSchema = z.object({
  version: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .regex(/^[A-Za-z0-9._-]+$/u),
  reason: z.string().trim().min(3).max(500),
});
export const actionReasonSchema = z.object({ reason: z.string().trim().min(3).max(500) });

export const approvalListQuerySchema = paginationQuerySchema.extend({
  status: z.enum(approvalRequestStatuses).optional(),
  action_type: z.enum(approvalActionTypes).optional(),
  entity_type: z.string().trim().max(100).optional(),
  entity_id: z.string().uuid().optional(),
});

export const auditListQuerySchema = paginationQuerySchema.extend({
  action: z.string().trim().max(120).optional(),
  administrator: z.string().trim().max(254).optional(),
  entity_type: z.string().trim().max(100).optional(),
  entity_id: z.string().uuid().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

export const identitySwitchSchema = z.object({ slot: z.enum(['primary', 'secondary']) });
