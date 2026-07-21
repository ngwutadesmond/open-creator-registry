import { z } from '@hono/zod-openapi';

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
import { validateHandle } from '@open-creator-registry/normalization';
import {
  externalProfilePlatforms,
  externalProfileVerificationStatuses,
} from '@open-creator-registry/contracts/sources';

import { defaultPageSize, maximumBatchSize, maximumPageSize } from './constants';

export const requestMetaSchema = z
  .object({
    request_id: z.uuid().openapi({ example: 'd09aeebd-c412-4e2b-98f2-c328b42c2093' }),
    timestamp: z.iso.datetime().openapi({ example: '2026-07-21T16:00:00.000Z' }),
  })
  .openapi('RequestMeta');

export const validationDetailSchema = z
  .object({
    code: z.string().openapi({ example: 'too_small' }),
    message: z.string().openapi({ example: 'A handle is required.' }),
    path: z.string().openapi({ example: 'handle' }),
  })
  .openapi('ValidationDetail');

export const errorEnvelopeSchema = z
  .object({
    error: z.object({
      code: z.enum([
        'bad_request',
        'conflict',
        'cors_origin_forbidden',
        'database_unavailable',
        'internal_error',
        'method_not_allowed',
        'not_found',
        'rate_limited',
        'request_too_large',
        'unsupported_media_type',
        'validation_failed',
      ]),
      message: z.string(),
      details: z.array(validationDetailSchema),
    }),
    meta: requestMetaSchema,
  })
  .openapi('ErrorEnvelope');

export const paginationSchema = z
  .object({
    page: z.int().min(1),
    limit: z.int().min(1).max(maximumPageSize),
    total: z.int().min(0),
    total_pages: z.int().min(0),
    has_next_page: z.boolean(),
    has_previous_page: z.boolean(),
  })
  .openapi('Pagination');

export const registryClassificationSchema = z
  .enum(registryClassifications)
  .openapi('RegistryClassification', {
    description:
      'Protection classification only. not_listed never means that a username is available.',
  });
export const recommendedActionSchema = z.enum(recommendedActions).openapi('RecommendedAction', {
  description:
    'The action recommended to a consuming platform after its separate local availability and policy checks.',
});
export const handleMatchTypeSchema = z.enum(handleMatchTypes).openapi('HandleMatchType');

export const publicCreatorSchema = z
  .object({
    id: z.uuid(),
    canonical_name: z.string(),
    entity_type: z.string(),
    primary_category: z.string().nullable(),
    country_codes: z.array(z.string()).nullable(),
    biography_summary: z.string().nullable(),
    notoriety_score: z.int().min(0).max(100),
    protection_tier: z.enum(creatorProtectionTiers),
    created_at: z.iso.datetime(),
    updated_at: z.iso.datetime(),
  })
  .openapi('PublicCreator');

export const publicAliasSchema = z
  .object({
    id: z.uuid(),
    alias: z.string(),
    normalized_alias: z.string(),
    language: z.string().nullable(),
    alias_type: z.enum(aliasTypes),
    confidence_score: z.int().min(0).max(100),
  })
  .openapi('PublicCreatorAlias');

export const publicHandleSchema = z
  .object({
    id: z.uuid(),
    display_handle: z.string(),
    normalized_handle: z.string(),
    classification: registryClassificationSchema,
    confidence_score: z.int().min(0).max(100),
    status: z.enum(reservationStatuses),
    reason_summary: z.string(),
    created_at: z.iso.datetime(),
    updated_at: z.iso.datetime(),
  })
  .openapi('PublicReservedHandle');

export const publicSourceSchema = z
  .object({
    id: z.uuid(),
    source_name: z.string(),
    source_entity_id: z.string(),
    source_url: z.url().nullable(),
    source_license: z.string().nullable(),
    last_checked_at: z.iso.datetime().nullable(),
  })
  .openapi('PublicCreatorSource');

export const publicExternalProfileSchema = z
  .object({
    platform: z.enum(externalProfilePlatforms),
    account_id: z.string().nullable(),
    handle: z.string().nullable(),
    profile_name: z.string().nullable(),
    url: z.url().nullable(),
    verification_status: z.enum(externalProfileVerificationStatuses),
    is_primary: z.boolean(),
    last_verified_at: z.iso.datetime().nullable(),
  })
  .openapi('PublicCreatorExternalProfile');

export const publicCreatorDetailSchema = publicCreatorSchema
  .extend({
    aliases: z.array(publicAliasSchema),
    handles: z.array(publicHandleSchema),
    sources: z.array(publicSourceSchema),
    external_profiles: z.array(publicExternalProfileSchema),
  })
  .openapi('PublicCreatorDetail');

export const handleInputSchema = z
  .string()
  .max(128)
  .superRefine((value, context) => {
    const validation = validateHandle(value);
    if (!validation.valid) {
      validation.issues.forEach((issue) =>
        context.addIssue({
          code: 'custom',
          message: issue.message,
          params: { validation_code: issue.code },
        }),
      );
    }
  })
  .openapi({ example: '@demo_aurora_vale' });

export const handleCheckQuerySchema = z.object({
  handle: handleInputSchema.openapi({
    param: { in: 'query', name: 'handle' },
    description: 'The requested username or handle. A leading @ is accepted.',
  }),
});

export const handleCheckDataSchema = z
  .object({
    input: z.string(),
    normalized_handle: z.string(),
    registry_status: registryClassificationSchema,
    recommended_action: recommendedActionSchema,
    claim_allowed: z.boolean(),
    registration_may_continue: z.literal(true),
    matched_by: handleMatchTypeSchema,
    confidence_score: z.int().min(0).max(100),
    ambiguous: z.boolean(),
    creator: publicCreatorSchema.nullable(),
    reservation_status: z.enum(reservationStatuses).nullable(),
    registry_version: z.string().nullable(),
    registry_last_updated_at: z.iso.datetime().nullable(),
  })
  .openapi('HandleCheckResult');

export const handleCheckResponseSchema = z
  .object({ data: handleCheckDataSchema, meta: requestMetaSchema })
  .openapi('HandleCheckResponse');

export const batchHandleCheckRequestSchema = z
  .object({
    handles: z.array(handleInputSchema).min(1).max(maximumBatchSize),
  })
  .strict()
  .openapi('BatchHandleCheckRequest');

export const batchHandleResultSchema = handleCheckDataSchema
  .omit({ registry_version: true, registry_last_updated_at: true })
  .openapi('BatchHandleCheckResult');

export const batchHandleCheckResponseSchema = z
  .object({
    data: z.object({
      results: z.array(batchHandleResultSchema),
      registry: z.object({
        version: z.string().nullable(),
        last_updated_at: z.iso.datetime().nullable(),
      }),
    }),
    meta: requestMetaSchema,
  })
  .openapi('BatchHandleCheckResponse');

const pageQuery = z.coerce
  .number()
  .int()
  .min(1)
  .default(1)
  .openapi({
    param: { in: 'query', name: 'page' },
    example: 1,
  });
const limitQuery = z.coerce.number().int().min(1).max(maximumPageSize).default(defaultPageSize);

export const creatorListQuerySchema = z.object({
  query: z.string().trim().min(1).max(120).optional(),
  category: z.string().trim().min(1).max(64).optional(),
  country: z
    .string()
    .regex(/^[A-Za-z]{2}$/u)
    .optional(),
  protection_tier: z.enum(creatorProtectionTiers).optional(),
  review_status: z.literal('approved').optional(),
  source: z.string().trim().min(1).max(80).optional(),
  page: pageQuery,
  limit: limitQuery,
  sort: z
    .enum(['canonical_name', 'created_at', 'notoriety_score', 'updated_at'])
    .default('canonical_name'),
  order: z.enum(['asc', 'desc']).default('asc'),
});

export const creatorListResponseSchema = z
  .object({
    data: z.array(publicCreatorSchema),
    pagination: paginationSchema,
    meta: requestMetaSchema,
  })
  .openapi('CreatorListResponse');

export const creatorIdParamsSchema = z.object({
  creatorId: z.uuid().openapi({ param: { in: 'path', name: 'creatorId' } }),
});

export const creatorDetailResponseSchema = z
  .object({ data: publicCreatorDetailSchema, meta: requestMetaSchema })
  .openapi('CreatorDetailResponse');

export const creatorChildrenQuerySchema = z.object({
  page: pageQuery,
  limit: limitQuery,
});

export const creatorHandlesResponseSchema = z
  .object({
    data: z.array(publicHandleSchema),
    pagination: paginationSchema,
    meta: requestMetaSchema,
  })
  .openapi('CreatorHandlesResponse');

export const creatorAliasesResponseSchema = z
  .object({
    data: z.array(publicAliasSchema),
    pagination: paginationSchema,
    meta: requestMetaSchema,
  })
  .openapi('CreatorAliasesResponse');

export const healthDataSchema = z
  .object({
    service: z.literal('Open Creator Registry API'),
    status: z.enum(['ok', 'unavailable']),
    api_version: z.string(),
    environment: z.string(),
    database: z.object({ status: z.enum(['connected', 'unavailable']) }),
    registry_version: z.string().nullable(),
  })
  .openapi('HealthData');

export const healthResponseSchema = z
  .object({ data: healthDataSchema, meta: requestMetaSchema })
  .openapi('HealthResponse');

export const registryMetaDataSchema = z
  .object({
    name: z.literal('Open Creator Registry'),
    description: z.string(),
    api_version: z.string(),
    current_registry_version: z.string().nullable(),
    record_counts: z.object({
      approved_creators: z.int().min(0),
      active_reserved_handles: z.int().min(0),
    }),
    last_published_at: z.iso.datetime().nullable(),
    last_updated_at: z.iso.datetime().nullable(),
    data_policy_url: z.string(),
    disclaimer: z.string(),
    source_policy_summary: z.string(),
    demonstration_data: z.boolean(),
  })
  .openapi('RegistryMetadata');

export const registryMetaResponseSchema = z
  .object({ data: registryMetaDataSchema, meta: requestMetaSchema })
  .openapi('RegistryMetadataResponse');

export const registryReleaseSchema = z
  .object({
    id: z.uuid(),
    version: z.string(),
    record_count: z.int().min(0),
    checksum: z.string(),
    published_at: z.iso.datetime(),
  })
  .openapi('PublicRegistryRelease');

export const releaseListQuerySchema = z.object({
  page: pageQuery,
  limit: limitQuery,
});

export const registryReleasesResponseSchema = z
  .object({
    data: z.array(registryReleaseSchema),
    pagination: paginationSchema,
    meta: requestMetaSchema,
  })
  .openapi('RegistryReleaseListResponse');

export const publicSubmissionRequestSchema = z
  .object({
    creator_name: z.string().trim().min(2).max(120),
    category: z.string().trim().min(1).max(64).nullable().optional(),
    country_codes: z
      .array(z.string().regex(/^[A-Za-z]{2}$/u))
      .max(10)
      .nullable()
      .optional(),
    requested_handles: z.array(handleInputSchema).min(1).max(10),
    public_sources: z.array(z.url()).min(1).max(10),
  })
  .strict()
  .openapi('PublicSubmissionRequest');

export const publicSubmissionAcknowledgementSchema = z
  .object({
    id: z.uuid(),
    submission_status: z.literal('pending'),
    created_at: z.iso.datetime(),
    message: z.string(),
  })
  .openapi('PublicSubmissionAcknowledgement');

export const publicSubmissionResponseSchema = z
  .object({ data: publicSubmissionAcknowledgementSchema, meta: requestMetaSchema })
  .openapi('PublicSubmissionResponse');
