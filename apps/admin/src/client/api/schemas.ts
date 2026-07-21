import { z } from 'zod';

export const responseMetaSchema = z.object({ request_id: z.string(), timestamp: z.string() });
export const paginationSchema = z.object({
  page: z.number(),
  limit: z.number(),
  total: z.number(),
  total_pages: z.number(),
  has_next_page: z.boolean(),
  has_previous_page: z.boolean(),
});
export const errorEnvelopeSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z
      .array(z.object({ code: z.string(), message: z.string(), path: z.string() }))
      .default([]),
  }),
  meta: responseMetaSchema.optional(),
});

export const identitySchema = z.object({
  subject: z.string(),
  email: z.string(),
  display_name: z.string(),
  roles: z.array(z.string()),
  permissions: z.array(z.string()),
  authentication_source: z.string(),
});
export type AdminIdentityResponse = z.infer<typeof identitySchema>;

export const creatorSchema = z.object({
  id: z.string(),
  canonical_name: z.string(),
  normalized_name: z.string(),
  entity_type: z.string(),
  primary_category: z.string().nullable(),
  country_codes: z.array(z.string()).nullable(),
  biography_summary: z.string().nullable(),
  notoriety_score: z.number(),
  protection_tier: z.string(),
  review_status: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type AdminCreator = z.infer<typeof creatorSchema>;

export const aliasSchema = z.object({
  id: z.string(),
  creator_entity_id: z.string(),
  alias: z.string(),
  normalized_alias: z.string(),
  confusable_skeleton: z.string(),
  language: z.string().nullable(),
  alias_type: z.string(),
  confidence_score: z.number(),
  source_id: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export const sourceSchema = z.object({
  id: z.string(),
  creator_entity_id: z.string(),
  source_name: z.string(),
  source_entity_id: z.string(),
  source_url: z.string().nullable(),
  source_license: z.string().nullable(),
  verification_status: z.string(),
  last_checked_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export const handleSchema = z.object({
  id: z.string(),
  creator_entity_id: z.string(),
  display_handle: z.string(),
  normalized_handle: z.string(),
  confusable_skeleton: z.string(),
  classification: z.string(),
  confidence_score: z.number(),
  decision_source: z.string(),
  reason: z.string(),
  status: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type AdminHandle = z.infer<typeof handleSchema>;
export const candidateSchema = z.object({
  id: z.string(),
  canonical_name: z.string(),
  normalized_name: z.string(),
  category: z.string().nullable(),
  country_codes: z.array(z.string()).nullable(),
  discovery_source: z.string(),
  confidence_score: z.number(),
  review_status: z.string(),
  discovered_at: z.string(),
  reviewed_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export const submissionSchema = z.object({
  id: z.string(),
  creator_name: z.string(),
  category: z.string().nullable(),
  country_codes: z.array(z.string()).nullable(),
  requested_handles: z.array(z.string()),
  public_sources: z.array(z.string()),
  submission_status: z.string(),
  created_at: z.string(),
  reviewed_at: z.string().nullable(),
  updated_at: z.string(),
});
export const releaseSchema = z.object({
  id: z.string(),
  version: z.string(),
  record_count: z.number(),
  checksum: z.string(),
  release_status: z.string(),
  published_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export const approvalSchema = z.object({
  id: z.string(),
  action_type: z.string(),
  entity_type: z.string(),
  entity_id: z.string().nullable(),
  requested_by: z.string(),
  requested_payload: z.unknown(),
  reason: z.string(),
  status: z.string(),
  required_approvals: z.number(),
  approval_count: z.number(),
  target_revision: z.string().nullable(),
  expires_at: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  resolved_at: z.string().nullable(),
  applied_at: z.string().nullable(),
});
export const importBatchSchema = z.object({
  id: z.string(),
  format: z.string(),
  file_name: z.string(),
  checksum: z.string(),
  status: z.string(),
  total_rows: z.number(),
  valid_rows: z.number(),
  invalid_rows: z.number(),
  duplicate_rows: z.number(),
  warning_rows: z.number(),
  validated_payload: z.unknown(),
  summary: z.unknown().nullable(),
  created_by: z.string(),
  committed_by: z.string().nullable(),
  created_at: z.string(),
  committed_at: z.string().nullable(),
  completed_at: z.string().nullable(),
  updated_at: z.string(),
});
export const ingestionRunSchema = z.object({
  id: z.string(),
  source_name: z.string(),
  status: z.string(),
  imported_count: z.number(),
  updated_count: z.number(),
  skipped_count: z.number(),
  failed_count: z.number(),
  error_summary: z.string().nullable(),
  started_at: z.string(),
  completed_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export const auditSchema = z.object({
  id: z.string(),
  action: z.string(),
  entity_type: z.string(),
  entity_id: z.string().nullable(),
  actor_identifier: z.string(),
  previous_value: z.unknown().nullable(),
  new_value: z.unknown().nullable(),
  metadata: z.unknown().nullable(),
  created_at: z.string(),
});

export function listEnvelopeSchema<T extends z.ZodType>(item: T) {
  return z.object({
    data: z.array(item),
    meta: responseMetaSchema.extend({ pagination: paginationSchema }),
  });
}

export function dataEnvelopeSchema<T extends z.ZodType>(data: T) {
  return z.object({ data, meta: responseMetaSchema });
}
