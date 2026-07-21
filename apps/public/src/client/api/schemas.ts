import { z } from 'zod';

import {
  recommendedActions,
  registryClassifications,
} from '@open-creator-registry/contracts/classifications';
import {
  aliasTypes,
  creatorProtectionTiers,
  handleMatchTypes,
  reservationStatuses,
} from '@open-creator-registry/contracts/domain';

const requestMetaSchema = z.object({
  request_id: z.uuid(),
  timestamp: z.iso.datetime(),
});

const paginationSchema = z.object({
  page: z.number().int().min(1),
  limit: z.number().int().min(1).max(100),
  total: z.number().int().min(0),
  total_pages: z.number().int().min(0),
  has_next_page: z.boolean(),
  has_previous_page: z.boolean(),
});

const publicCreatorSchema = z.object({
  id: z.uuid(),
  canonical_name: z.string(),
  entity_type: z.string(),
  primary_category: z.string().nullable(),
  country_codes: z.array(z.string()).nullable(),
  biography_summary: z.string().nullable(),
  notoriety_score: z.number().int().min(0).max(100),
  protection_tier: z.enum(creatorProtectionTiers),
  created_at: z.iso.datetime(),
  updated_at: z.iso.datetime(),
});

const publicAliasSchema = z.object({
  id: z.uuid(),
  alias: z.string(),
  normalized_alias: z.string(),
  language: z.string().nullable(),
  alias_type: z.enum(aliasTypes),
  confidence_score: z.number().int().min(0).max(100),
});

const publicHandleSchema = z.object({
  id: z.uuid(),
  display_handle: z.string(),
  normalized_handle: z.string(),
  classification: z.enum(registryClassifications),
  confidence_score: z.number().int().min(0).max(100),
  status: z.enum(reservationStatuses),
  reason_summary: z.string(),
  created_at: z.iso.datetime(),
  updated_at: z.iso.datetime(),
});

const publicSourceSchema = z.object({
  id: z.uuid(),
  source_name: z.string(),
  source_entity_id: z.string(),
  source_url: z.url().nullable(),
  source_license: z.string().nullable(),
  last_checked_at: z.iso.datetime().nullable(),
});

const publicCreatorDetailSchema = publicCreatorSchema.extend({
  aliases: z.array(publicAliasSchema),
  handles: z.array(publicHandleSchema),
  sources: z.array(publicSourceSchema),
});

export const handleCheckResponseSchema = z.object({
  data: z.object({
    input: z.string(),
    normalized_handle: z.string(),
    registry_status: z.enum(registryClassifications),
    recommended_action: z.enum(recommendedActions),
    claim_allowed: z.boolean(),
    registration_may_continue: z.literal(true),
    matched_by: z.enum(handleMatchTypes),
    confidence_score: z.number().int().min(0).max(100),
    ambiguous: z.boolean(),
    creator: publicCreatorSchema.nullable(),
    reservation_status: z.enum(reservationStatuses).nullable(),
    registry_version: z.string().nullable(),
    registry_last_updated_at: z.iso.datetime().nullable(),
  }),
  meta: requestMetaSchema,
});

export const creatorListResponseSchema = z.object({
  data: z.array(publicCreatorSchema),
  pagination: paginationSchema,
  meta: requestMetaSchema,
});

export const creatorDetailResponseSchema = z.object({
  data: publicCreatorDetailSchema,
  meta: requestMetaSchema,
});

export const creatorHandlesResponseSchema = z.object({
  data: z.array(publicHandleSchema),
  pagination: paginationSchema,
  meta: requestMetaSchema,
});

export const creatorAliasesResponseSchema = z.object({
  data: z.array(publicAliasSchema),
  pagination: paginationSchema,
  meta: requestMetaSchema,
});

export const registryMetaResponseSchema = z.object({
  data: z.object({
    name: z.literal('Open Creator Registry'),
    description: z.string(),
    api_version: z.string(),
    current_registry_version: z.string().nullable(),
    record_counts: z.object({
      approved_creators: z.number().int().min(0),
      active_reserved_handles: z.number().int().min(0),
    }),
    last_published_at: z.iso.datetime().nullable(),
    last_updated_at: z.iso.datetime().nullable(),
    data_policy_url: z.string(),
    disclaimer: z.string(),
    source_policy_summary: z.string(),
    demonstration_data: z.boolean(),
  }),
  meta: requestMetaSchema,
});

export const registryReleasesResponseSchema = z.object({
  data: z.array(
    z.object({
      id: z.uuid(),
      version: z.string(),
      record_count: z.number().int().min(0),
      checksum: z.string(),
      published_at: z.iso.datetime(),
    }),
  ),
  pagination: paginationSchema,
  meta: requestMetaSchema,
});

export const submissionResponseSchema = z.object({
  data: z.object({
    id: z.uuid(),
    submission_status: z.literal('pending'),
    created_at: z.iso.datetime(),
    message: z.string(),
  }),
  meta: requestMetaSchema,
});

export const errorEnvelopeSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.array(
      z.object({
        code: z.string(),
        message: z.string(),
        path: z.string(),
      }),
    ),
  }),
  meta: requestMetaSchema,
});

export type HandleCheckResponse = z.infer<typeof handleCheckResponseSchema>;
export type HandleCheckResult = HandleCheckResponse['data'];
export type PublicCreator = z.infer<typeof publicCreatorSchema>;
export type PublicCreatorDetail = z.infer<typeof publicCreatorDetailSchema>;
export type PublicAlias = z.infer<typeof publicAliasSchema>;
export type PublicHandle = z.infer<typeof publicHandleSchema>;
export type PublicSource = z.infer<typeof publicSourceSchema>;
export type CreatorListResponse = z.infer<typeof creatorListResponseSchema>;
export type PaginationData = z.infer<typeof paginationSchema>;
export type RegistryMetaResponse = z.infer<typeof registryMetaResponseSchema>;
export type RegistryMetadata = RegistryMetaResponse['data'];
export type RegistryReleasesResponse = z.infer<typeof registryReleasesResponseSchema>;
export type RegistryRelease = RegistryReleasesResponse['data'][number];
export type SubmissionResponse = z.infer<typeof submissionResponseSchema>;
export type SubmissionAcknowledgement = SubmissionResponse['data'];
