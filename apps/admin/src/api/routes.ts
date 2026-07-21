import { Scalar } from '@scalar/hono-api-reference';
import { bodyLimit } from 'hono/body-limit';
import type { Context } from 'hono';
import { Hono } from 'hono';
import { z } from 'zod';

import { hasAdminPermission } from '@open-creator-registry/contracts/admin';
import { RegistryDatabaseError } from '@open-creator-registry/database/errors';
import { parseJson, type JsonValue } from '@open-creator-registry/database/json';
import {
  createAdminApprovalRepository,
  type CriticalHandlePayload,
} from '@open-creator-registry/database/repositories/admin-approval-repository';
import { createAuditLogRepository } from '@open-creator-registry/database/repositories/audit-log-repository';
import { createCreatorAliasRepository } from '@open-creator-registry/database/repositories/creator-alias-repository';
import { createCreatorCandidateRepository } from '@open-creator-registry/database/repositories/creator-candidate-repository';
import { createCandidateProvenanceRepository } from '@open-creator-registry/database/repositories/candidate-provenance-repository';
import { createCreatorRepository } from '@open-creator-registry/database/repositories/creator-repository';
import { createCreatorSourceRepository } from '@open-creator-registry/database/repositories/creator-source-repository';
import { createImportBatchRepository } from '@open-creator-registry/database/repositories/import-batch-repository';
import { createIngestionRunRepository } from '@open-creator-registry/database/repositories/ingestion-run-repository';
import { createIngestionRecordOutcomeRepository } from '@open-creator-registry/database/repositories/ingestion-record-outcome-repository';
import { createExternalProfileRepository } from '@open-creator-registry/database/repositories/external-profile-repository';
import { createSourceConfigurationRepository } from '@open-creator-registry/database/repositories/source-configuration-repository';
import { createSourceCheckpointRepository } from '@open-creator-registry/database/repositories/source-checkpoint-repository';
import { createSourceLockRepository } from '@open-creator-registry/database/repositories/source-lock-repository';
import { createPublicRegistryRepository } from '@open-creator-registry/database/repositories/public-registry-repository';
import { createPublicSubmissionRepository } from '@open-creator-registry/database/repositories/public-submission-repository';
import { createRegistryReleaseRepository } from '@open-creator-registry/database/repositories/registry-release-repository';
import { createRegistryReleaseSnapshotRepository } from '@open-creator-registry/database/repositories/registry-release-snapshot-repository';
import { createReservedHandleRepository } from '@open-creator-registry/database/repositories/reserved-handle-repository';
import { createConfusableSkeleton, normalizeHandle } from '@open-creator-registry/normalization';
import { createWikidataFixtureFetch } from '@open-creator-registry/ingestion/fixtures';
import { createIngestionOrchestrator } from '@open-creator-registry/ingestion/orchestrator';
import { createDefaultConnectorRegistry } from '@open-creator-registry/ingestion/registry';

import type { AdminAppEnv, RequestMetadataProvider } from './app-env';
import { defaultRequestMetadataProvider } from './app-env';
import { adminAuthenticationMiddleware, switchLocalAdministrator } from './authentication';
import { adminAuthorizationMiddleware } from './authorization';
import {
  AdminImportValidationError,
  createAdminImportService,
  validatedRecordsFromPayload,
} from './import-service';
import {
  adminCorsMiddleware,
  adminSecurityHeadersMiddleware,
  createRequestContextMiddleware,
} from './middleware';
import { createAdminOpenApiDocument } from './openapi';
import { createAdminReleaseService } from './release-service';
import { errorEnvelope, paginationMeta, successEnvelope } from './responses';
import {
  actionReasonSchema,
  aliasIdParamsSchema,
  aliasInputSchema,
  aliasPatchSchema,
  approvalIdParamsSchema,
  approvalListQuerySchema,
  auditListQuerySchema,
  auditLogIdParamsSchema,
  candidateApproveSchema,
  candidateDecisionSchema,
  candidateIdParamsSchema,
  candidateListQuerySchema,
  candidateMergeSchema,
  conflictCheckSchema,
  checkpointIdParamsSchema,
  creatorIdParamsSchema,
  creatorInputSchema,
  creatorListQuerySchema,
  creatorPatchSchema,
  externalProfileConflictSchema,
  externalProfileInputSchema,
  externalProfilePatchSchema,
  handleIdParamsSchema,
  handleInputSchema,
  handleListQuerySchema,
  handlePatchSchema,
  identitySwitchSchema,
  importCommitSchema,
  importIdParamsSchema,
  importListQuerySchema,
  importPreviewSchema,
  ingestionListQuerySchema,
  ingestionStartSchema,
  profileIdParamsSchema,
  releaseCreateSchema,
  releaseIdParamsSchema,
  releaseListQuerySchema,
  reviewDecisionSchema,
  runIdParamsSchema,
  sourceIdParamsSchema,
  sourceConfigurationPatchSchema,
  sourceLockParamsSchema,
  sourceNameParamsSchema,
  sourceInputSchema,
  sourcePatchSchema,
  submissionIdParamsSchema,
  submissionListQuerySchema,
} from './schemas';
import { toAdminApiValue } from './serialization';

class AdminRequestError extends Error {
  constructor(
    readonly code:
      'authorization_denied' | 'bad_request' | 'conflict' | 'not_found' | 'validation_failed',
    message: string,
    readonly details: Array<{ code: string; message: string; path: string }> = [],
  ) {
    super(message);
    this.name = 'AdminRequestError';
  }
}

function validationDetails(error: z.ZodError) {
  return error.issues.map((issue) => ({
    code: issue.code,
    message: issue.message,
    path: issue.path.join('.'),
  }));
}

function parseParams<T>(context: Context<AdminAppEnv>, schema: z.ZodType<T>): T {
  const parsed = schema.safeParse(context.req.param());
  if (!parsed.success)
    throw new AdminRequestError(
      'validation_failed',
      'The request path is invalid.',
      validationDetails(parsed.error),
    );
  return parsed.data;
}

function parseQuery<T>(context: Context<AdminAppEnv>, schema: z.ZodType<T>): T {
  const parsed = schema.safeParse(context.req.query());
  if (!parsed.success)
    throw new AdminRequestError(
      'validation_failed',
      'The request query is invalid.',
      validationDetails(parsed.error),
    );
  return parsed.data;
}

async function parseBody<T>(context: Context<AdminAppEnv>, schema: z.ZodType<T>): Promise<T> {
  let body: unknown;
  try {
    body = await context.req.json<unknown>();
  } catch {
    throw new AdminRequestError('bad_request', 'The request body must contain valid JSON.');
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success)
    throw new AdminRequestError(
      'validation_failed',
      'The request body is invalid.',
      validationDetails(parsed.error),
    );
  return parsed.data;
}

function jsonValue(value: unknown): JsonValue {
  return parseJson(JSON.stringify(value), 'administration audit value');
}

async function appendAudit(
  context: Context<AdminAppEnv>,
  input: {
    action: string;
    entityType: string;
    entityId?: string | null;
    previous?: unknown;
    next?: unknown;
    metadata?: Record<string, JsonValue>;
  },
) {
  const identity = context.get('adminIdentity');
  return createAuditLogRepository(context.env.DB).append({
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    actorIdentifier: identity.email,
    previousValue: input.previous === undefined ? null : jsonValue(input.previous),
    newValue: input.next === undefined ? null : jsonValue(input.next),
    metadata: {
      request_id: context.get('requestId'),
      ...(input.metadata ?? {}),
    },
  });
}

function notFound(entity: string): never {
  throw new AdminRequestError('not_found', `${entity} was not found.`);
}

function expiresInOneDay(timestamp: string): string {
  return new Date(new Date(timestamp).getTime() + 24 * 60 * 60 * 1000).toISOString();
}

const criticalHandlePayloadSchema = z.object({
  id: z.string().uuid(),
  creatorEntityId: z.string().uuid(),
  displayHandle: z.string(),
  normalizedHandle: z.string(),
  confusableSkeleton: z.string(),
  classification: z.enum(['hard_reserved', 'soft_protected', 'monitored', 'not_listed']),
  confidenceScore: z.number().int().min(0).max(100),
  decisionSource: z.string(),
  reason: z.string(),
  status: z.enum(['active', 'suspended', 'released', 'disputed']),
});
const releaseApprovalPayloadSchema = z.object({
  releaseId: z.string().uuid(),
  checksum: z.string(),
  updatedAt: z.string().datetime(),
});
const externalProfileApprovalPayloadSchema = z.object({
  id: z.string().uuid(),
  creatorEntityId: z.string().uuid().optional(),
  platform: z
    .enum([
      'youtube',
      'spotify',
      'tiktok',
      'instagram',
      'x',
      'facebook',
      'twitch',
      'soundcloud',
      'apple_music',
      'official_website',
      'other',
      'twitter',
    ])
    .optional(),
  platformAccountId: z.string().nullable().optional(),
  platformHandle: z.string().nullable().optional(),
  profileUrl: z.string().nullable().optional(),
  profileName: z.string().nullable().optional(),
  isPrimary: z.boolean().optional(),
  verificationStatus: z
    .enum([
      'unverified',
      'source_linked',
      'cross_source_confirmed',
      'manually_verified',
      'creator_verified',
      'stale',
      'disputed',
      'rejected',
    ])
    .optional(),
  visibilityStatus: z.enum(['public', 'private', 'suppressed']).optional(),
  sourceName: z.string().optional(),
  sourceReference: z.string().nullable().optional(),
  sourceLicense: z.string().nullable().optional(),
  confidenceScore: z.number().int().min(0).max(100).optional(),
  connectorVersion: z.string().nullable().optional(),
  mappingVersion: z.string().nullable().optional(),
  lastVerifiedAt: z.string().datetime().nullable().optional(),
});

function criticalPayload(input: {
  id: string;
  creatorEntityId: string;
  displayHandle: string;
  classification: 'hard_reserved' | 'soft_protected' | 'monitored' | 'not_listed';
  confidenceScore: number;
  decisionSource: string;
  reason: string;
  status: 'active' | 'suspended' | 'released' | 'disputed';
}): CriticalHandlePayload {
  const normalizedHandle = normalizeHandle(input.displayHandle);
  return {
    ...input,
    displayHandle: input.displayHandle.trim(),
    normalizedHandle,
    confusableSkeleton: createConfusableSkeleton(normalizedHandle),
  };
}

function requireCriticalPermission(context: Context<AdminAppEnv>) {
  const identity = context.get('adminIdentity');
  if (!hasAdminPermission(identity.roles, 'handles:critical')) {
    throw new AdminRequestError(
      'authorization_denied',
      'Critical handle changes require the super-admin permission.',
    );
  }
}

function externalProfileInput(
  creatorEntityId: string,
  input: Omit<z.infer<typeof externalProfileConflictSchema>, 'creator_entity_id'> & {
    creator_entity_id?: string;
  },
) {
  return {
    creatorEntityId,
    platform: input.platform,
    platformAccountId: input.platform_account_id,
    platformHandle: input.platform_handle,
    profileUrl: input.profile_url,
    profileName: input.profile_name,
    isPrimary: input.is_primary,
    verificationStatus: input.verification_status,
    visibilityStatus: input.visibility_status,
    sourceName: input.source_name,
    sourceReference: input.source_reference,
    sourceLicense: input.source_license,
    confidenceScore: input.confidence_score,
    connectorVersion: input.connector_version,
    mappingVersion: input.mapping_version,
    lastVerifiedAt: input.last_verified_at,
  };
}

function connectorContext(context: Context<AdminAppEnv>) {
  return context.env.WIKIDATA_FIXTURE_MODE === 'enabled'
    ? {
        fetch: createWikidataFixtureFetch(),
        now: () => metadataTimestamp(context),
        sleep: () => Promise.resolve(),
        random: () => 0,
      }
    : undefined;
}

function metadataTimestamp(context: Context<AdminAppEnv>): string {
  return context.get('requestTimestamp');
}

export type AdminAppDependencies = { metadata?: RequestMetadataProvider };

export function createAdminApp(dependencies: AdminAppDependencies = {}) {
  const metadata = dependencies.metadata ?? defaultRequestMetadataProvider;
  const app = new Hono<AdminAppEnv>();

  app.use('*', createRequestContextMiddleware(metadata));
  app.use('*', adminSecurityHeadersMiddleware);
  app.use('/api/admin/v1/*', adminCorsMiddleware);
  app.use('/admin-openapi.json', adminCorsMiddleware);
  app.use('/admin-docs', adminCorsMiddleware);
  app.use('/api/admin/v1/*', adminAuthenticationMiddleware);
  app.use('/admin-openapi.json', adminAuthenticationMiddleware);
  app.use('/admin-docs', adminAuthenticationMiddleware);
  app.use('/api/admin/v1/*', adminAuthorizationMiddleware);
  app.use(
    '/api/admin/v1/*',
    bodyLimit({
      maxSize: 300 * 1024,
      onError: (untyped) => {
        // Hono's body-limit callback currently erases the application environment generic.
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const context: Context<AdminAppEnv> = untyped;
        return context.json(
          errorEnvelope(
            context,
            'request_too_large',
            'The request body exceeds the 300 KiB administration limit.',
          ),
          413,
        );
      },
    }),
  );
  app.use('/api/admin/v1/*', async (context, next) => {
    if (!['GET', 'HEAD', 'DELETE', 'OPTIONS'].includes(context.req.method)) {
      const contentType = context.req.header('Content-Type') ?? '';
      if (!/^application\/json(?:\s*;|$)/iu.test(contentType)) {
        return context.json(
          {
            error: {
              code: 'unsupported_media_type' as const,
              message: 'Administration mutations require application/json.',
              details: [],
            },
            meta: {
              request_id: context.get('requestId'),
              timestamp: context.get('requestTimestamp'),
            },
          },
          415,
        );
      }
    }
    await next();
  });

  app.get('/api/admin/v1/health', async (context) => {
    const connected = await createPublicRegistryRepository(context.env.DB).checkConnectivity();
    return context.json(
      successEnvelope(context, {
        service: 'Open Creator Registry Administration API',
        status: connected ? 'ok' : 'unavailable',
        environment: context.env.ENVIRONMENT,
        database: { status: connected ? 'connected' : 'unavailable' },
      }),
      connected ? 200 : 503,
    );
  });

  app.get('/api/admin/v1/me', (context) =>
    context.json(successEnvelope(context, toAdminApiValue(context.get('adminIdentity'))), 200),
  );

  app.post('/api/admin/v1/development/identity', async (context) => {
    if (context.env.ENVIRONMENT !== 'local' || context.env.AUTH_PROVIDER !== 'local_development') {
      return context.json(
        errorEnvelope(context, 'authorization_denied', 'Local identity switching is disabled.'),
        403,
      );
    }
    const body = await parseBody(context, identitySwitchSchema);
    await appendAudit(context, {
      action: 'authentication.local_identity_switched',
      entityType: 'admin_identity',
      entityId: null,
      metadata: { selected_slot: body.slot },
    });
    switchLocalAdministrator(context, body.slot);
    return context.json(
      successEnvelope(context, { selected_slot: body.slot, restart_required: false }),
      200,
    );
  });

  app.get('/api/admin/v1/dashboard', async (context) => {
    const creators = createCreatorRepository(context.env.DB);
    const handles = createReservedHandleRepository(context.env.DB);
    const candidates = createCreatorCandidateRepository(context.env.DB);
    const submissions = createPublicSubmissionRepository(context.env.DB);
    const approvals = createAdminApprovalRepository(context.env.DB);
    const releases = createRegistryReleaseRepository(context.env.DB);
    const runs = createIngestionRunRepository(context.env.DB);
    const audits = createAuditLogRepository(context.env.DB);
    const [
      approvedCreators,
      activeHandles,
      hardHandles,
      softHandles,
      monitoredHandles,
      pendingCandidates,
      pendingSubmissions,
      pendingApprovals,
      latestRelease,
      recentRuns,
      recentAudits,
    ] = await Promise.all([
      creators.count({ reviewStatus: 'approved' }),
      handles.count({ status: 'active' }),
      handles.count({ status: 'active', classification: 'hard_reserved' }),
      handles.count({ status: 'active', classification: 'soft_protected' }),
      handles.count({ status: 'active', classification: 'monitored' }),
      candidates.count({ reviewStatus: 'pending' }),
      submissions.count({ submissionStatus: 'pending' }),
      approvals.count({ status: 'pending' }),
      releases.findLatestPublished(),
      runs.list({ page: 1, limit: 5 }),
      audits.list({ page: 1, limit: 10 }),
    ]);
    return context.json(
      successEnvelope(
        context,
        toAdminApiValue({
          metrics: {
            approvedCreators,
            activeHandles,
            hardHandles,
            softHandles,
            monitoredHandles,
            pendingCandidates,
            pendingSubmissions,
            pendingApprovals,
          },
          latestRelease,
          recentRuns: recentRuns.items,
          recentAudits: recentAudits.items,
          demonstrationData: true,
        }),
      ),
      200,
    );
  });

  app.get('/api/admin/v1/creators', async (context) => {
    const query = parseQuery(context, creatorListQuerySchema);
    const repository = createCreatorRepository(context.env.DB);
    const options = {
      page: query.page,
      limit: query.limit,
      query: query.query,
      primaryCategory: query.category,
      country: query.country,
      protectionTier: query.protection_tier,
      reviewStatus: query.review_status,
      sort: query.sort,
      direction: query.order,
    };
    const [result, total] = await Promise.all([
      repository.list(options),
      repository.count(options),
    ]);
    return context.json(
      {
        data: toAdminApiValue(result.items),
        meta: {
          ...successEnvelope(context, null).meta,
          pagination: paginationMeta(result.page, result.limit, total),
        },
      },
      200,
    );
  });

  app.post('/api/admin/v1/creators', async (context) => {
    const body = await parseBody(context, creatorInputSchema);
    const repository = createCreatorRepository(context.env.DB);
    const duplicates = await repository.findByNormalizedName(body.canonical_name);
    if (duplicates.length > 0 && !body.allow_common_name_duplicate)
      throw new AdminRequestError(
        'conflict',
        'A creator with this normalized name already exists. Explicitly acknowledge a reviewed common-name duplicate to continue.',
      );
    const created = await repository.create({
      canonicalName: body.canonical_name,
      entityType: body.entity_type,
      primaryCategory: body.primary_category,
      countryCodes: body.country_codes,
      biographySummary: body.biography_summary,
      notorietyScore: body.notoriety_score,
      protectionTier: body.protection_tier,
      reviewStatus: body.review_status,
    });
    await appendAudit(context, {
      action: 'creator.created',
      entityType: 'creator_entity',
      entityId: created.id,
      next: created,
      metadata: { common_name_override: body.allow_common_name_duplicate },
    });
    return context.json(successEnvelope(context, toAdminApiValue(created)), 201);
  });

  app.get('/api/admin/v1/creators/:creatorId', async (context) => {
    const { creatorId } = parseParams(context, creatorIdParamsSchema);
    const creator = await createCreatorRepository(context.env.DB).findById(creatorId);
    if (!creator) notFound('Creator');
    const [aliases, sources, profiles, handles, audits, approvals] = await Promise.all([
      createCreatorAliasRepository(context.env.DB).listByCreator(creatorId),
      createCreatorSourceRepository(context.env.DB).listByCreator(creatorId),
      createExternalProfileRepository(context.env.DB).listByCreator(creatorId),
      createReservedHandleRepository(context.env.DB).listByCreator(creatorId),
      createAuditLogRepository(context.env.DB).findByEntity('creator_entity', creatorId),
      createAdminApprovalRepository(context.env.DB).list({
        entityType: 'creator_entity',
        entityId: creatorId,
        limit: 50,
      }),
    ]);
    return context.json(
      successEnvelope(
        context,
        toAdminApiValue({
          creator,
          aliases,
          sources,
          profiles,
          handles,
          auditHistory: audits,
          approvalRequests: approvals.items,
        }),
      ),
      200,
    );
  });

  app.patch('/api/admin/v1/creators/:creatorId', async (context) => {
    const { creatorId } = parseParams(context, creatorIdParamsSchema);
    const body = await parseBody(context, creatorPatchSchema);
    const repository = createCreatorRepository(context.env.DB);
    const previous = await repository.findById(creatorId);
    if (!previous) notFound('Creator');
    if (body.canonical_name && body.canonical_name !== previous.canonicalName) {
      const duplicates = await repository.findByNormalizedName(body.canonical_name);
      if (duplicates.some((item) => item.id !== creatorId) && !body.allow_common_name_duplicate)
        throw new AdminRequestError('conflict', 'Another creator has this normalized name.');
    }
    const updated = await repository.update(creatorId, {
      canonicalName: body.canonical_name,
      entityType: body.entity_type,
      primaryCategory: body.primary_category,
      countryCodes: body.country_codes,
      biographySummary: body.biography_summary,
      notorietyScore: body.notoriety_score,
      protectionTier: body.protection_tier,
      reviewStatus: body.review_status,
    });
    await appendAudit(context, {
      action: 'creator.updated',
      entityType: 'creator_entity',
      entityId: creatorId,
      previous,
      next: updated,
    });
    return context.json(successEnvelope(context, toAdminApiValue(updated)), 200);
  });

  app.get('/api/admin/v1/creators/:creatorId/profiles', async (context) => {
    const { creatorId } = parseParams(context, creatorIdParamsSchema);
    if (!(await createCreatorRepository(context.env.DB).findById(creatorId))) notFound('Creator');
    const profiles = await createExternalProfileRepository(context.env.DB).listByCreator(creatorId);
    return context.json(successEnvelope(context, toAdminApiValue(profiles)), 200);
  });
  app.post('/api/admin/v1/creators/:creatorId/profiles', async (context) => {
    const { creatorId } = parseParams(context, creatorIdParamsSchema);
    const body = await parseBody(context, externalProfileInputSchema);
    const creator = await createCreatorRepository(context.env.DB).findById(creatorId);
    if (!creator) notFound('Creator');
    const input = externalProfileInput(creatorId, body);
    const repository = createExternalProfileRepository(context.env.DB);
    const conflicts = await repository.checkConflicts(input);
    if (conflicts.some((conflict) => conflict.type !== 'primary_profile'))
      throw new AdminRequestError(
        'conflict',
        'The profile conflicts with an existing association.',
      );
    if (creator.protectionTier === 'critical') {
      requireCriticalPermission(context);
      const profileId = crypto.randomUUID();
      const approval = await createAdminApprovalRepository(context.env.DB).create({
        actionType: 'external_profile.create_critical',
        entityType: 'creator_external_profile',
        entityId: profileId,
        requestedBy: context.get('adminIdentity').email,
        requestedPayload: jsonValue({ id: profileId, ...input }),
        reason: body.change_reason,
        expiresAt: expiresInOneDay(context.get('requestTimestamp')),
        requestId: context.get('requestId'),
      });
      return context.json(successEnvelope(context, toAdminApiValue(approval)), 202);
    }
    const created = await repository.create(input);
    await appendAudit(context, {
      action: 'external_profile.created',
      entityType: 'creator_external_profile',
      entityId: created.id,
      next: created,
      metadata: { reason: body.change_reason },
    });
    return context.json(successEnvelope(context, toAdminApiValue(created)), 201);
  });
  app.get('/api/admin/v1/external-profiles/:profileId', async (context) => {
    const { profileId } = parseParams(context, profileIdParamsSchema);
    const profile = await createExternalProfileRepository(context.env.DB).findById(profileId);
    if (!profile) notFound('External profile');
    return context.json(successEnvelope(context, toAdminApiValue(profile)), 200);
  });
  app.patch('/api/admin/v1/external-profiles/:profileId', async (context) => {
    const { profileId } = parseParams(context, profileIdParamsSchema);
    const body = await parseBody(context, externalProfilePatchSchema);
    const repository = createExternalProfileRepository(context.env.DB);
    const previous = await repository.findById(profileId);
    if (!previous) notFound('External profile');
    const creator = await createCreatorRepository(context.env.DB).findById(
      previous.creatorEntityId,
    );
    if (!creator) notFound('Creator');
    const input = externalProfileInput(previous.creatorEntityId, {
      platform: body.platform ?? previous.platform,
      platform_account_id:
        body.platform_account_id === undefined
          ? previous.platformAccountId
          : body.platform_account_id,
      platform_handle:
        body.platform_handle === undefined ? previous.platformHandle : body.platform_handle,
      profile_url: body.profile_url === undefined ? previous.profileUrl : body.profile_url,
      profile_name: body.profile_name === undefined ? previous.profileName : body.profile_name,
      is_primary: body.is_primary ?? previous.isPrimary,
      verification_status: body.verification_status ?? previous.verificationStatus,
      visibility_status: body.visibility_status ?? previous.visibilityStatus,
      source_name: body.source_name ?? previous.sourceName,
      source_reference:
        body.source_reference === undefined ? previous.sourceReference : body.source_reference,
      source_license:
        body.source_license === undefined ? previous.sourceLicense : body.source_license,
      confidence_score: body.confidence_score ?? previous.confidenceScore,
      connector_version:
        body.connector_version === undefined ? previous.connectorVersion : body.connector_version,
      mapping_version:
        body.mapping_version === undefined ? previous.mappingVersion : body.mapping_version,
      last_verified_at:
        body.last_verified_at === undefined ? previous.lastVerifiedAt : body.last_verified_at,
    });
    const conflicts = await repository.checkConflicts(input, profileId);
    if (conflicts.some((conflict) => conflict.type !== 'primary_profile'))
      throw new AdminRequestError(
        'conflict',
        'The profile conflicts with an existing association.',
      );
    if (creator.protectionTier === 'critical') {
      requireCriticalPermission(context);
      const approval = await createAdminApprovalRepository(context.env.DB).create({
        actionType: 'external_profile.update_critical',
        entityType: 'creator_external_profile',
        entityId: profileId,
        requestedBy: context.get('adminIdentity').email,
        requestedPayload: jsonValue({ id: profileId, ...input }),
        reason: body.change_reason,
        targetRevision: previous.updatedAt,
        expiresAt: expiresInOneDay(context.get('requestTimestamp')),
        requestId: context.get('requestId'),
      });
      return context.json(successEnvelope(context, toAdminApiValue(approval)), 202);
    }
    const updated = await repository.update(profileId, input);
    await appendAudit(context, {
      action: 'external_profile.updated',
      entityType: 'creator_external_profile',
      entityId: profileId,
      previous,
      next: updated,
      metadata: { reason: body.change_reason },
    });
    return context.json(successEnvelope(context, toAdminApiValue(updated)), 200);
  });
  app.delete('/api/admin/v1/external-profiles/:profileId', async (context) => {
    const { profileId } = parseParams(context, profileIdParamsSchema);
    const repository = createExternalProfileRepository(context.env.DB);
    const previous = await repository.findById(profileId);
    if (!previous) notFound('External profile');
    const creator = await createCreatorRepository(context.env.DB).findById(
      previous.creatorEntityId,
    );
    if (!creator) notFound('Creator');
    if (creator.protectionTier === 'critical') {
      requireCriticalPermission(context);
      const approval = await createAdminApprovalRepository(context.env.DB).create({
        actionType: 'external_profile.delete_critical',
        entityType: 'creator_external_profile',
        entityId: profileId,
        requestedBy: context.get('adminIdentity').email,
        requestedPayload: jsonValue({ id: profileId }),
        reason: 'Suppress an external profile association.',
        targetRevision: previous.updatedAt,
        expiresAt: expiresInOneDay(context.get('requestTimestamp')),
        requestId: context.get('requestId'),
      });
      return context.json(successEnvelope(context, toAdminApiValue(approval)), 202);
    }
    const updated = await repository.deactivate(profileId);
    await appendAudit(context, {
      action: 'external_profile.suppressed',
      entityType: 'creator_external_profile',
      entityId: profileId,
      previous,
      next: updated,
    });
    return context.json(successEnvelope(context, toAdminApiValue(updated)), 200);
  });
  app.post('/api/admin/v1/external-profiles/check-conflicts', async (context) => {
    const body = await parseBody(context, externalProfileConflictSchema);
    const conflicts = await createExternalProfileRepository(context.env.DB).checkConflicts(
      externalProfileInput(body.creator_entity_id, body),
    );
    return context.json(successEnvelope(context, toAdminApiValue({ conflicts })), 200);
  });

  app.get('/api/admin/v1/creators/:creatorId/aliases', async (context) => {
    const { creatorId } = parseParams(context, creatorIdParamsSchema);
    return context.json(
      successEnvelope(
        context,
        toAdminApiValue(
          await createCreatorAliasRepository(context.env.DB).listByCreator(creatorId),
        ),
      ),
      200,
    );
  });
  app.post('/api/admin/v1/creators/:creatorId/aliases', async (context) => {
    const { creatorId } = parseParams(context, creatorIdParamsSchema);
    const body = await parseBody(context, aliasInputSchema);
    if (!(await createCreatorRepository(context.env.DB).findById(creatorId))) notFound('Creator');
    if (body.source_id) {
      const source = await createCreatorSourceRepository(context.env.DB).findById(body.source_id);
      if (!source || source.creatorEntityId !== creatorId)
        throw new AdminRequestError(
          'validation_failed',
          'The alias source must belong to this creator.',
        );
    }
    const created = await createCreatorAliasRepository(context.env.DB).create({
      creatorEntityId: creatorId,
      alias: body.alias,
      language: body.language,
      aliasType: body.alias_type,
      confidenceScore: body.confidence_score,
      sourceId: body.source_id,
    });
    await appendAudit(context, {
      action: 'alias.created',
      entityType: 'creator_alias',
      entityId: created.id,
      next: created,
    });
    return context.json(successEnvelope(context, toAdminApiValue(created)), 201);
  });
  app.patch('/api/admin/v1/aliases/:aliasId', async (context) => {
    const { aliasId } = parseParams(context, aliasIdParamsSchema);
    const body = await parseBody(context, aliasPatchSchema);
    const repository = createCreatorAliasRepository(context.env.DB);
    const previous = await repository.findById(aliasId);
    if (!previous) notFound('Alias');
    if (body.source_id) {
      const source = await createCreatorSourceRepository(context.env.DB).findById(body.source_id);
      if (!source || source.creatorEntityId !== previous.creatorEntityId)
        throw new AdminRequestError(
          'validation_failed',
          'The alias source must belong to the same creator.',
        );
    }
    const updated = await repository.update(aliasId, {
      alias: body.alias,
      language: body.language,
      aliasType: body.alias_type,
      confidenceScore: body.confidence_score,
      sourceId: body.source_id,
    });
    await appendAudit(context, {
      action: 'alias.updated',
      entityType: 'creator_alias',
      entityId: aliasId,
      previous,
      next: updated,
    });
    return context.json(successEnvelope(context, toAdminApiValue(updated)), 200);
  });
  app.delete('/api/admin/v1/aliases/:aliasId', async (context) => {
    const { aliasId } = parseParams(context, aliasIdParamsSchema);
    const repository = createCreatorAliasRepository(context.env.DB);
    const previous = await repository.findById(aliasId);
    if (!previous) notFound('Alias');
    await repository.delete(aliasId);
    await appendAudit(context, {
      action: 'alias.deleted',
      entityType: 'creator_alias',
      entityId: aliasId,
      previous,
      metadata: { protection_warning_acknowledged: true },
    });
    return context.body(null, 204);
  });

  app.get('/api/admin/v1/creators/:creatorId/sources', async (context) => {
    const { creatorId } = parseParams(context, creatorIdParamsSchema);
    return context.json(
      successEnvelope(
        context,
        toAdminApiValue(
          await createCreatorSourceRepository(context.env.DB).listByCreator(creatorId),
        ),
      ),
      200,
    );
  });
  app.post('/api/admin/v1/creators/:creatorId/sources', async (context) => {
    const { creatorId } = parseParams(context, creatorIdParamsSchema);
    const body = await parseBody(context, sourceInputSchema);
    if (!(await createCreatorRepository(context.env.DB).findById(creatorId))) notFound('Creator');
    const created = await createCreatorSourceRepository(context.env.DB).create({
      creatorEntityId: creatorId,
      sourceName: body.source_name,
      sourceEntityId: body.source_entity_id,
      sourceUrl: body.source_url,
      sourceLicense: body.source_license,
      verificationStatus: body.verification_status,
      lastCheckedAt: body.last_checked_at,
    });
    await appendAudit(context, {
      action: 'source.created',
      entityType: 'creator_source',
      entityId: created.id,
      next: created,
    });
    return context.json(successEnvelope(context, toAdminApiValue(created)), 201);
  });
  app.patch('/api/admin/v1/sources/:sourceId', async (context) => {
    const { sourceId } = parseParams(context, sourceIdParamsSchema);
    const body = await parseBody(context, sourcePatchSchema);
    const repository = createCreatorSourceRepository(context.env.DB);
    const previous = await repository.findById(sourceId);
    if (!previous) notFound('Source');
    const updated = await repository.update(sourceId, {
      sourceUrl: body.source_url,
      sourceLicense: body.source_license,
      verificationStatus: body.verification_status,
      lastCheckedAt: body.last_checked_at,
    });
    await appendAudit(context, {
      action: 'source.updated',
      entityType: 'creator_source',
      entityId: sourceId,
      previous,
      next: updated,
    });
    return context.json(successEnvelope(context, toAdminApiValue(updated)), 200);
  });
  app.delete('/api/admin/v1/sources/:sourceId', async (context) => {
    const { sourceId } = parseParams(context, sourceIdParamsSchema);
    const repository = createCreatorSourceRepository(context.env.DB);
    const previous = await repository.findById(sourceId);
    if (!previous) notFound('Source');
    await repository.delete(sourceId);
    await appendAudit(context, {
      action: 'source.deleted',
      entityType: 'creator_source',
      entityId: sourceId,
      previous,
    });
    return context.body(null, 204);
  });

  app.get('/api/admin/v1/reserved-handles', async (context) => {
    const query = parseQuery(context, handleListQuerySchema);
    const repository = createReservedHandleRepository(context.env.DB);
    const options = {
      page: query.page,
      limit: query.limit,
      query: query.query,
      creatorEntityId: query.creator_id,
      creatorProtectionTier: query.creator_tier,
      classification: query.classification,
      status: query.status,
    };
    const [result, total] = await Promise.all([
      repository.list(options),
      repository.count(options),
    ]);
    return context.json(
      {
        data: toAdminApiValue(result.items),
        meta: {
          ...successEnvelope(context, null).meta,
          pagination: paginationMeta(result.page, result.limit, total),
        },
      },
      200,
    );
  });

  app.post('/api/admin/v1/reserved-handles/check-conflicts', async (context) => {
    const body = await parseBody(context, conflictCheckSchema);
    const repository = createReservedHandleRepository(context.env.DB);
    const aliases = createCreatorAliasRepository(context.env.DB);
    const normalized = normalizeHandle(body.handle);
    const skeleton = createConfusableSkeleton(normalized);
    const [exact, confusable, aliasMatches] = await Promise.all([
      repository.findExact(body.handle),
      repository.findByConfusableSkeleton(skeleton),
      aliases.findByNormalizedAlias(body.handle),
    ]);
    const creator = body.creator_entity_id
      ? await createCreatorRepository(context.env.DB).findById(body.creator_entity_id)
      : null;
    return context.json(
      successEnvelope(
        context,
        toAdminApiValue({
          input: body.handle,
          normalizedHandle: normalized,
          confusableSkeleton: skeleton,
          exactConflict: exact,
          confusableConflicts: confusable,
          aliasConflicts: aliasMatches,
          creator,
          requiresSecondApproval: creator?.protectionTier === 'critical',
        }),
      ),
      200,
    );
  });

  app.post('/api/admin/v1/reserved-handles', async (context) => {
    const body = await parseBody(context, handleInputSchema);
    const creator = await createCreatorRepository(context.env.DB).findById(body.creator_entity_id);
    if (!creator) notFound('Creator');
    const repository = createReservedHandleRepository(context.env.DB);
    if (await repository.findExact(body.display_handle))
      throw new AdminRequestError('conflict', 'This globally normalized handle already exists.');
    const isCritical =
      creator.protectionTier === 'critical' && body.classification === 'hard_reserved';
    if (isCritical) {
      requireCriticalPermission(context);
      const id = crypto.randomUUID();
      const payload = criticalPayload({
        id,
        creatorEntityId: body.creator_entity_id,
        displayHandle: body.display_handle,
        classification: body.classification,
        confidenceScore: body.confidence_score,
        decisionSource: body.decision_source,
        reason: body.reason,
        status: body.status,
      });
      const identity = context.get('adminIdentity');
      const approval = await createAdminApprovalRepository(context.env.DB).create({
        actionType: 'handle.create_critical',
        entityType: 'reserved_handle',
        entityId: id,
        requestedBy: identity.email,
        requestedPayload: jsonValue(payload),
        reason: body.reason,
        expiresAt: expiresInOneDay(context.get('requestTimestamp')),
        requestId: context.get('requestId'),
      });
      return context.json(
        successEnvelope(
          context,
          toAdminApiValue({ approvalRequest: approval, intendedChange: payload, applied: false }),
        ),
        202,
      );
    }
    const created = await repository.create({
      creatorEntityId: body.creator_entity_id,
      displayHandle: body.display_handle,
      classification: body.classification,
      confidenceScore: body.confidence_score,
      decisionSource: body.decision_source,
      reason: body.reason,
      status: body.status,
    });
    await appendAudit(context, {
      action: 'handle.created',
      entityType: 'reserved_handle',
      entityId: created.id,
      next: created,
    });
    return context.json(successEnvelope(context, toAdminApiValue(created)), 201);
  });

  app.get('/api/admin/v1/reserved-handles/:handleId', async (context) => {
    const { handleId } = parseParams(context, handleIdParamsSchema);
    const handle = await createReservedHandleRepository(context.env.DB).findById(handleId);
    if (!handle) notFound('Reserved handle');
    const [creator, audits, approvals, confusable] = await Promise.all([
      createCreatorRepository(context.env.DB).findById(handle.creatorEntityId),
      createAuditLogRepository(context.env.DB).findByEntity('reserved_handle', handleId),
      createAdminApprovalRepository(context.env.DB).list({
        entityType: 'reserved_handle',
        entityId: handleId,
        limit: 50,
      }),
      createReservedHandleRepository(context.env.DB).findByConfusableSkeleton(
        handle.confusableSkeleton,
      ),
    ]);
    return context.json(
      successEnvelope(
        context,
        toAdminApiValue({
          handle,
          creator,
          auditHistory: audits,
          approvalRequests: approvals.items,
          conflicts: {
            exact: handle,
            confusable: confusable.filter((item) => item.id !== handle.id),
          },
        }),
      ),
      200,
    );
  });

  app.patch('/api/admin/v1/reserved-handles/:handleId', async (context) => {
    const { handleId } = parseParams(context, handleIdParamsSchema);
    const body = await parseBody(context, handlePatchSchema);
    const repository = createReservedHandleRepository(context.env.DB);
    const previous = await repository.findById(handleId);
    if (!previous) notFound('Reserved handle');
    const creatorId = body.creator_entity_id ?? previous.creatorEntityId;
    const creator = await createCreatorRepository(context.env.DB).findById(creatorId);
    if (!creator) notFound('Creator');
    const payload = criticalPayload({
      id: handleId,
      creatorEntityId: creatorId,
      displayHandle: body.display_handle ?? previous.displayHandle,
      classification: body.classification ?? previous.classification,
      confidenceScore: body.confidence_score ?? previous.confidenceScore,
      decisionSource: body.decision_source ?? previous.decisionSource,
      reason: body.reason ?? previous.reason,
      status: body.status ?? previous.status,
    });
    const isCritical =
      creator.protectionTier === 'critical' &&
      (payload.classification === 'hard_reserved' || previous.classification === 'hard_reserved');
    if (isCritical) {
      requireCriticalPermission(context);
      const identity = context.get('adminIdentity');
      const approval = await createAdminApprovalRepository(context.env.DB).create({
        actionType: 'handle.update_critical',
        entityType: 'reserved_handle',
        entityId: handleId,
        requestedBy: identity.email,
        requestedPayload: jsonValue(payload),
        reason: payload.reason,
        targetRevision: previous.updatedAt,
        expiresAt: expiresInOneDay(context.get('requestTimestamp')),
        requestId: context.get('requestId'),
      });
      return context.json(
        successEnvelope(
          context,
          toAdminApiValue({ approvalRequest: approval, intendedChange: payload, applied: false }),
        ),
        202,
      );
    }
    const updated = await repository.update(handleId, {
      creatorEntityId: body.creator_entity_id,
      displayHandle: body.display_handle,
      classification: body.classification,
      confidenceScore: body.confidence_score,
      decisionSource: body.decision_source,
      reason: body.reason,
    });
    if (body.status && body.status !== updated.status)
      await repository.updateStatus(handleId, body.status);
    const final = await repository.findById(handleId);
    await appendAudit(context, {
      action: 'handle.updated',
      entityType: 'reserved_handle',
      entityId: handleId,
      previous,
      next: final,
    });
    return context.json(successEnvelope(context, toAdminApiValue(final)), 200);
  });

  const registerHandleStatusAction = (
    action: 'suspend' | 'release' | 'restore',
    status: 'suspended' | 'released' | 'active',
  ) => {
    app.post(`/api/admin/v1/reserved-handles/:handleId/${action}`, async (context) => {
      const { handleId } = parseParams(context, handleIdParamsSchema);
      const body = await parseBody(context, actionReasonSchema);
      const repository = createReservedHandleRepository(context.env.DB);
      const previous = await repository.findById(handleId);
      if (!previous) notFound('Reserved handle');
      const creator = await createCreatorRepository(context.env.DB).findById(
        previous.creatorEntityId,
      );
      if (!creator) notFound('Creator');
      const critical =
        creator.protectionTier === 'critical' && previous.classification === 'hard_reserved';
      if (critical) {
        requireCriticalPermission(context);
        const identity = context.get('adminIdentity');
        const payload = criticalPayload({
          id: previous.id,
          creatorEntityId: previous.creatorEntityId,
          displayHandle: previous.displayHandle,
          classification: previous.classification,
          confidenceScore: previous.confidenceScore,
          decisionSource: previous.decisionSource,
          reason: previous.reason,
          status,
        });
        const approval = await createAdminApprovalRepository(context.env.DB).create({
          actionType: `handle.${action}_critical`,
          entityType: 'reserved_handle',
          entityId: handleId,
          requestedBy: identity.email,
          requestedPayload: jsonValue(payload),
          reason: body.reason,
          targetRevision: previous.updatedAt,
          expiresAt: expiresInOneDay(context.get('requestTimestamp')),
          requestId: context.get('requestId'),
        });
        return context.json(
          successEnvelope(
            context,
            toAdminApiValue({ approvalRequest: approval, intendedChange: payload, applied: false }),
          ),
          202,
        );
      }
      const updated = await repository.updateStatus(handleId, status);
      await appendAudit(context, {
        action: `handle.${action}`,
        entityType: 'reserved_handle',
        entityId: handleId,
        previous,
        next: updated,
        metadata: { reason: body.reason },
      });
      return context.json(successEnvelope(context, toAdminApiValue(updated)), 200);
    });
  };
  registerHandleStatusAction('suspend', 'suspended');
  registerHandleStatusAction('release', 'released');
  registerHandleStatusAction('restore', 'active');

  app.get('/api/admin/v1/candidates', async (context) => {
    const query = parseQuery(context, candidateListQuerySchema);
    const repository = createCreatorCandidateRepository(context.env.DB);
    const options = {
      page: query.page,
      limit: query.limit,
      query: query.query,
      reviewStatus: query.status,
      category: query.category,
    };
    const [result, total] = await Promise.all([
      repository.list(options),
      repository.count(options),
    ]);
    return context.json(
      {
        data: toAdminApiValue(result.items),
        meta: {
          ...successEnvelope(context, null).meta,
          pagination: paginationMeta(result.page, result.limit, total),
        },
      },
      200,
    );
  });
  app.get('/api/admin/v1/candidates/:candidateId', async (context) => {
    const { candidateId } = parseParams(context, candidateIdParamsSchema);
    const candidate = await createCreatorCandidateRepository(context.env.DB).findById(candidateId);
    if (!candidate) notFound('Candidate');
    const matches = await createCreatorRepository(context.env.DB).findByNormalizedName(
      candidate.canonicalName,
    );
    return context.json(
      successEnvelope(
        context,
        toAdminApiValue({
          candidate,
          provenance: await createCandidateProvenanceRepository(context.env.DB).listByCandidate(
            candidateId,
          ),
          potentialCreatorMatches: matches,
          policy:
            'Candidate approval may create a pending creator draft, but never creates or reserves a handle.',
        }),
      ),
      200,
    );
  });
  app.post('/api/admin/v1/candidates/:candidateId/approve', async (context) => {
    const { candidateId } = parseParams(context, candidateIdParamsSchema);
    const body = await parseBody(context, candidateApproveSchema);
    const repository = createCreatorCandidateRepository(context.env.DB);
    const previous = await repository.findById(candidateId);
    if (!previous) notFound('Candidate');
    let creator = null;
    if (body.create_creator_draft) {
      const matches = await createCreatorRepository(context.env.DB).findByNormalizedName(
        previous.canonicalName,
      );
      if (matches.length === 0)
        creator = await createCreatorRepository(context.env.DB).create({
          canonicalName: previous.canonicalName,
          entityType: 'person',
          primaryCategory: previous.category,
          countryCodes: previous.countryCodes,
          biographySummary: `Creator draft created from candidate source ${previous.discoverySource}.`,
          notorietyScore: previous.confidenceScore,
          protectionTier: previous.confidenceScore >= 85 ? 'notable' : 'watchlist',
          reviewStatus: 'pending',
        });
    }
    const updated = await repository.updateReviewStatus(candidateId, 'approved');
    await appendAudit(context, {
      action: 'candidate.approved',
      entityType: 'creator_candidate',
      entityId: candidateId,
      previous,
      next: updated,
      metadata: { reason: body.reason, creator_draft_id: creator?.id ?? null },
    });
    return context.json(
      successEnvelope(
        context,
        toAdminApiValue({ candidate: updated, creatorDraft: creator, handlesCreated: 0 }),
      ),
      200,
    );
  });
  const candidateStatusAction = (
    action: 'reject' | 'request-review',
    status: 'rejected' | 'pending',
  ) =>
    app.post(`/api/admin/v1/candidates/:candidateId/${action}`, async (context) => {
      const { candidateId } = parseParams(context, candidateIdParamsSchema);
      const body = await parseBody(context, candidateDecisionSchema);
      const repository = createCreatorCandidateRepository(context.env.DB);
      const previous = await repository.findById(candidateId);
      if (!previous) notFound('Candidate');
      const updated = await repository.updateReviewStatus(candidateId, status);
      await appendAudit(context, {
        action: `candidate.${action}`,
        entityType: 'creator_candidate',
        entityId: candidateId,
        previous,
        next: updated,
        metadata: { reason: body.reason },
      });
      return context.json(successEnvelope(context, toAdminApiValue(updated)), 200);
    });
  candidateStatusAction('reject', 'rejected');
  candidateStatusAction('request-review', 'pending');
  app.post('/api/admin/v1/candidates/:candidateId/merge', async (context) => {
    const { candidateId } = parseParams(context, candidateIdParamsSchema);
    const body = await parseBody(context, candidateMergeSchema);
    const repository = createCreatorCandidateRepository(context.env.DB);
    const previous = await repository.findById(candidateId);
    if (!previous) notFound('Candidate');
    const target = await createCreatorRepository(context.env.DB).findById(body.target_creator_id);
    if (!target) notFound('Target creator');
    const updated = await repository.updateReviewStatus(candidateId, 'merged');
    await appendAudit(context, {
      action: 'candidate.merged',
      entityType: 'creator_candidate',
      entityId: candidateId,
      previous,
      next: updated,
      metadata: {
        reason: body.reason,
        target_creator_id: target.id,
        discovery_source: previous.discoverySource,
      },
    });
    return context.json(
      successEnvelope(context, toAdminApiValue({ candidate: updated, targetCreator: target })),
      200,
    );
  });

  app.get('/api/admin/v1/submissions', async (context) => {
    const query = parseQuery(context, submissionListQuerySchema);
    const repository = createPublicSubmissionRepository(context.env.DB);
    const options = { page: query.page, limit: query.limit, submissionStatus: query.status };
    const [result, total] = await Promise.all([
      repository.list(options),
      repository.count(options),
    ]);
    return context.json(
      {
        data: toAdminApiValue(result.items),
        meta: {
          ...successEnvelope(context, null).meta,
          pagination: paginationMeta(result.page, result.limit, total),
        },
      },
      200,
    );
  });
  app.get('/api/admin/v1/submissions/:submissionId', async (context) => {
    const { submissionId } = parseParams(context, submissionIdParamsSchema);
    const submission = await createPublicSubmissionRepository(context.env.DB).findById(
      submissionId,
    );
    if (!submission) notFound('Submission');
    const creatorMatches = await createCreatorRepository(context.env.DB).findByNormalizedName(
      submission.creatorName,
    );
    return context.json(
      successEnvelope(
        context,
        toAdminApiValue({
          submission,
          potentialCreatorMatches: creatorMatches,
          policy:
            'Approval does not create a live reservation. Convert to a candidate, resolve identity, then decide handles separately.',
        }),
      ),
      200,
    );
  });
  const submissionStatusAction = (
    action: 'start-review' | 'approve' | 'reject',
    status: 'under_review' | 'approved' | 'rejected',
  ) =>
    app.post(`/api/admin/v1/submissions/:submissionId/${action}`, async (context) => {
      const { submissionId } = parseParams(context, submissionIdParamsSchema);
      const body = await parseBody(context, reviewDecisionSchema);
      const repository = createPublicSubmissionRepository(context.env.DB);
      const previous = await repository.findById(submissionId);
      if (!previous) notFound('Submission');
      const updated = await repository.updateStatus(submissionId, status);
      await appendAudit(context, {
        action: `submission.${action}`,
        entityType: 'public_submission',
        entityId: submissionId,
        previous,
        next: updated,
        metadata: { reason: body.reason, live_handles_created: 0 },
      });
      return context.json(
        successEnvelope(context, toAdminApiValue({ submission: updated, liveHandlesCreated: 0 })),
        200,
      );
    });
  submissionStatusAction('start-review', 'under_review');
  submissionStatusAction('approve', 'approved');
  submissionStatusAction('reject', 'rejected');
  app.post('/api/admin/v1/submissions/:submissionId/convert-to-candidate', async (context) => {
    const { submissionId } = parseParams(context, submissionIdParamsSchema);
    const body = await parseBody(context, reviewDecisionSchema);
    const submissions = createPublicSubmissionRepository(context.env.DB);
    const previous = await submissions.findById(submissionId);
    if (!previous) notFound('Submission');
    const candidate = await createCreatorCandidateRepository(context.env.DB).create({
      canonicalName: previous.creatorName,
      category: previous.category,
      countryCodes: previous.countryCodes,
      discoverySource: `public_submission:${submissionId}`,
      confidenceScore: 50,
    });
    const submission = await submissions.updateStatus(submissionId, 'under_review');
    await appendAudit(context, {
      action: 'submission.converted_to_candidate',
      entityType: 'public_submission',
      entityId: submissionId,
      previous,
      next: submission,
      metadata: { reason: body.reason, candidate_id: candidate.id, live_handles_created: 0 },
    });
    return context.json(
      successEnvelope(context, toAdminApiValue({ submission, candidate, liveHandlesCreated: 0 })),
      201,
    );
  });

  app.post('/api/admin/v1/imports/preview', async (context) => {
    const body = await parseBody(context, importPreviewSchema);
    const result = await createAdminImportService(context.env.DB).preview({
      format: body.format,
      fileName: body.file_name,
      content: body.content,
      actorIdentifier: context.get('adminIdentity').email,
    });
    await appendAudit(context, {
      action: 'import.previewed',
      entityType: 'import_batch',
      entityId: result.batch.id,
      next: {
        format: result.batch.format,
        file_name: result.batch.fileName,
        status: result.batch.status,
        total_rows: result.batch.totalRows,
        valid_rows: result.batch.validRows,
        invalid_rows: result.batch.invalidRows,
        duplicate_rows: result.batch.duplicateRows,
        warning_rows: result.batch.warningRows,
      },
      metadata: { checksum: result.batch.checksum },
    });
    return context.json(successEnvelope(context, toAdminApiValue(result)), 201);
  });
  app.post('/api/admin/v1/imports/commit', async (context) => {
    const body = await parseBody(context, importCommitSchema);
    const repository = createImportBatchRepository(context.env.DB);
    const batch = await repository.findById(body.import_id);
    if (!batch) notFound('Import batch');
    const records = validatedRecordsFromPayload(batch.validatedPayload);
    const committed = await repository.commit({
      importBatchId: batch.id,
      checksum: body.checksum,
      records,
      actorIdentifier: context.get('adminIdentity').email,
      requestId: context.get('requestId'),
    });
    return context.json(successEnvelope(context, toAdminApiValue(committed)), 200);
  });
  app.get('/api/admin/v1/imports', async (context) => {
    const query = parseQuery(context, importListQuerySchema);
    const repository = createImportBatchRepository(context.env.DB);
    const result = await repository.list({
      page: query.page,
      limit: query.limit,
      status: query.status,
    });
    const total = await repository.count({ status: query.status });
    return context.json(
      {
        data: toAdminApiValue(result.items),
        meta: {
          ...successEnvelope(context, null).meta,
          pagination: paginationMeta(result.page, result.limit, total),
        },
      },
      200,
    );
  });
  app.get('/api/admin/v1/imports/:importId', async (context) => {
    const { importId } = parseParams(context, importIdParamsSchema);
    const repository = createImportBatchRepository(context.env.DB);
    const batch = await repository.findById(importId);
    if (!batch) notFound('Import batch');
    return context.json(
      successEnvelope(
        context,
        toAdminApiValue({ batch, errors: await repository.listErrors(importId) }),
      ),
      200,
    );
  });

  app.get('/api/admin/v1/source-configurations', async (context) => {
    const repository = createSourceConfigurationRepository(context.env.DB);
    const result = await repository.list({ page: 1, limit: 100 });
    const [checkpoints, locks] = await Promise.all([
      createSourceCheckpointRepository(context.env.DB).list(),
      createSourceLockRepository(context.env.DB).list(),
    ]);
    return context.json(
      successEnvelope(
        context,
        toAdminApiValue({ configurations: result.items, checkpoints, locks }),
      ),
      200,
    );
  });
  app.get('/api/admin/v1/source-configurations/:sourceName', async (context) => {
    const { sourceName } = parseParams(context, sourceNameParamsSchema);
    const configuration = await createSourceConfigurationRepository(context.env.DB).findByName(
      sourceName,
    );
    if (!configuration) notFound('Source configuration');
    const checkpoint = await createSourceCheckpointRepository(context.env.DB).findBySourceScope(
      sourceName,
      'default',
    );
    const lock = await createSourceLockRepository(context.env.DB).find(sourceName, 'default');
    return context.json(
      successEnvelope(context, toAdminApiValue({ configuration, checkpoint, lock })),
      200,
    );
  });
  app.patch('/api/admin/v1/source-configurations/:sourceName', async (context) => {
    const { sourceName } = parseParams(context, sourceNameParamsSchema);
    const body = await parseBody(context, sourceConfigurationPatchSchema);
    const repository = createSourceConfigurationRepository(context.env.DB);
    const previous = await repository.findByName(sourceName);
    if (!previous) notFound('Source configuration');
    const proposed = {
      sourceName,
      enabled: body.enabled ?? previous.enabled,
      scheduledEnabled: body.scheduled_enabled ?? previous.scheduledEnabled,
      connectorVersion: body.connector_version ?? previous.connectorVersion,
      accessMode: body.access_mode ?? previous.accessMode,
      baseUrl: body.base_url ?? previous.baseUrl,
      batchSize: body.batch_size ?? previous.batchSize,
      maximumPagesPerRun: body.maximum_pages_per_run ?? previous.maximumPagesPerRun,
      maximumRecordsPerRun: body.maximum_records_per_run ?? previous.maximumRecordsPerRun,
      timeoutMs: body.timeout_ms ?? previous.timeoutMs,
      retryCount: body.retry_count ?? previous.retryCount,
      minimumRequestIntervalMs:
        body.minimum_request_interval_ms ?? previous.minimumRequestIntervalMs,
      scopeConfiguration:
        body.scope_configuration === undefined
          ? previous.scopeConfiguration
          : jsonValue(body.scope_configuration),
      candidateCreationEnabled:
        body.candidate_creation_enabled ?? previous.candidateCreationEnabled,
      dryRun: body.dry_run ?? previous.dryRun,
      sourceLicense: body.source_license ?? previous.sourceLicense,
      attribution: body.attribution ?? previous.attribution,
      configurationStatus: body.configuration_status ?? previous.configurationStatus,
    };
    const readiness = createDefaultConnectorRegistry()
      .get(sourceName)
      ?.validateConfiguration({ ...previous, ...proposed });
    if (readiness && readiness.status === 'invalid_configuration') {
      throw new AdminRequestError('validation_failed', readiness.message);
    }
    const updated = await repository.upsert(proposed);
    await appendAudit(context, {
      action: 'source_configuration.updated',
      entityType: 'source_configuration',
      entityId: null,
      previous,
      next: updated,
      metadata: { reason: body.reason, source_name: sourceName },
    });
    return context.json(successEnvelope(context, toAdminApiValue(updated)), 200);
  });
  app.post('/api/admin/v1/ingestion-runs/preview', async (context) => {
    const body = await parseBody(context, ingestionStartSchema);
    const result = await createIngestionOrchestrator({
      db: context.env.DB,
      registry: createDefaultConnectorRegistry(),
      connectorContext: connectorContext(context),
    }).execute({
      sourceName: body.source_name,
      scopeKey: body.scope_key,
      triggerType: 'manual_preview',
      preview: true,
      maximumDurationMs: 30_000,
    });
    await appendAudit(context, {
      action: 'ingestion.previewed',
      entityType: 'ingestion_run',
      entityId: result.runId,
      next: result,
    });
    return context.json(successEnvelope(context, toAdminApiValue(result)), 200);
  });
  app.post('/api/admin/v1/ingestion-runs/start', async (context) => {
    const body = await parseBody(context, ingestionStartSchema);
    const result = await createIngestionOrchestrator({
      db: context.env.DB,
      registry: createDefaultConnectorRegistry(),
      connectorContext: connectorContext(context),
    }).execute({
      sourceName: body.source_name,
      scopeKey: body.scope_key,
      triggerType: 'manual',
      maximumDurationMs: 60_000,
    });
    await appendAudit(context, {
      action: 'ingestion.started',
      entityType: 'ingestion_run',
      entityId: result.runId,
      next: result,
    });
    return context.json(successEnvelope(context, toAdminApiValue(result)), 200);
  });
  app.get('/api/admin/v1/source-checkpoints', async (context) =>
    context.json(
      successEnvelope(
        context,
        toAdminApiValue(await createSourceCheckpointRepository(context.env.DB).list()),
      ),
      200,
    ),
  );
  app.post('/api/admin/v1/source-checkpoints/:checkpointId/reset', async (context) => {
    const { checkpointId } = parseParams(context, checkpointIdParamsSchema);
    const body = await parseBody(context, actionReasonSchema);
    const repository = createSourceCheckpointRepository(context.env.DB);
    const previous = await repository.findById(checkpointId);
    if (!previous) notFound('Source checkpoint');
    const updated = await repository.reset(checkpointId, previous.connectorVersion);
    await appendAudit(context, {
      action: 'source_checkpoint.reset',
      entityType: 'source_checkpoint',
      entityId: checkpointId,
      previous,
      next: updated,
      metadata: { reason: body.reason },
    });
    return context.json(successEnvelope(context, toAdminApiValue(updated)), 200);
  });
  app.post('/api/admin/v1/source-locks/:sourceName/:scopeKey/force-release', async (context) => {
    const { sourceName, scopeKey } = parseParams(context, sourceLockParamsSchema);
    const body = await parseBody(context, actionReasonSchema);
    const repository = createSourceLockRepository(context.env.DB);
    const previous = await repository.find(sourceName, scopeKey);
    const released = await repository.forceRelease(sourceName, scopeKey);
    await appendAudit(context, {
      action: 'source_lock.force_released',
      entityType: 'source_run_lock',
      entityId: null,
      previous,
      next: { released },
      metadata: { reason: body.reason, source_name: sourceName, scope_key: scopeKey },
    });
    return context.json(successEnvelope(context, { released }), 200);
  });

  app.get('/api/admin/v1/ingestion-runs', async (context) => {
    const query = parseQuery(context, ingestionListQuerySchema);
    const repository = createIngestionRunRepository(context.env.DB);
    const options = {
      page: query.page,
      limit: query.limit,
      status: query.status,
      sourceName: query.source_name,
    };
    const [result, total] = await Promise.all([
      repository.list(options),
      repository.count(options),
    ]);
    return context.json(
      {
        data: toAdminApiValue(result.items),
        meta: {
          ...successEnvelope(context, null).meta,
          pagination: paginationMeta(result.page, result.limit, total),
        },
      },
      200,
    );
  });
  app.get('/api/admin/v1/ingestion-runs/:runId', async (context) => {
    const { runId } = parseParams(context, runIdParamsSchema);
    const run = await createIngestionRunRepository(context.env.DB).findById(runId);
    if (!run) notFound('Ingestion run');
    const records = await createIngestionRecordOutcomeRepository(context.env.DB).listByRun(runId, {
      page: 1,
      limit: 100,
    });
    return context.json(
      successEnvelope(context, toAdminApiValue({ run, records: records.items })),
      200,
    );
  });
  app.get('/api/admin/v1/ingestion-runs/:runId/records', async (context) => {
    const { runId } = parseParams(context, runIdParamsSchema);
    const query = parseQuery(context, ingestionListQuerySchema.pick({ page: true, limit: true }));
    const records = await createIngestionRecordOutcomeRepository(context.env.DB).listByRun(
      runId,
      query,
    );
    return context.json(successEnvelope(context, toAdminApiValue(records.items)), 200);
  });

  app.get('/api/admin/v1/releases', async (context) => {
    const query = parseQuery(context, releaseListQuerySchema);
    const repository = createRegistryReleaseRepository(context.env.DB);
    const options = { page: query.page, limit: query.limit, releaseStatus: query.status };
    const [result, total] = await Promise.all([
      repository.list(options),
      repository.count(options),
    ]);
    return context.json(
      {
        data: toAdminApiValue(result.items),
        meta: {
          ...successEnvelope(context, null).meta,
          pagination: paginationMeta(result.page, result.limit, total),
        },
      },
      200,
    );
  });
  app.post('/api/admin/v1/releases', async (context) => {
    const body = await parseBody(context, releaseCreateSchema);
    const created = await createRegistryReleaseRepository(context.env.DB).createDraft({
      version: body.version,
      recordCount: 0,
      checksum: 'uncalculated',
    });
    await appendAudit(context, {
      action: 'release.created',
      entityType: 'registry_release',
      entityId: created.id,
      next: created,
      metadata: { reason: body.reason, demonstration_data: true },
    });
    return context.json(successEnvelope(context, toAdminApiValue(created)), 201);
  });
  app.get('/api/admin/v1/releases/:releaseId', async (context) => {
    const { releaseId } = parseParams(context, releaseIdParamsSchema);
    const release = await createRegistryReleaseRepository(context.env.DB).findById(releaseId);
    if (!release) notFound('Registry release');
    const [snapshot, approvals, audits] = await Promise.all([
      createRegistryReleaseSnapshotRepository(context.env.DB).findByReleaseId(releaseId),
      createAdminApprovalRepository(context.env.DB).list({
        entityType: 'registry_release',
        entityId: releaseId,
        limit: 50,
      }),
      createAuditLogRepository(context.env.DB).findByEntity('registry_release', releaseId),
    ]);
    return context.json(
      successEnvelope(
        context,
        toAdminApiValue({
          release,
          snapshot,
          approvalRequests: approvals.items,
          auditHistory: audits,
          demonstrationDataWarning:
            'Local demonstration data is not an authoritative global release.',
        }),
      ),
      200,
    );
  });
  app.post('/api/admin/v1/releases/:releaseId/calculate', async (context) => {
    const { releaseId } = parseParams(context, releaseIdParamsSchema);
    await parseBody(context, actionReasonSchema);
    const calculated = await createAdminReleaseService(context.env.DB).calculate(
      releaseId,
      context.get('adminIdentity').email,
      context.get('requestId'),
    );
    if (!calculated) notFound('Registry release');
    return context.json(successEnvelope(context, toAdminApiValue(calculated)), 200);
  });
  app.post('/api/admin/v1/releases/:releaseId/request-approval', async (context) => {
    const { releaseId } = parseParams(context, releaseIdParamsSchema);
    const body = await parseBody(context, actionReasonSchema);
    const release = await createRegistryReleaseRepository(context.env.DB).findById(releaseId);
    const snapshot = await createRegistryReleaseSnapshotRepository(context.env.DB).findByReleaseId(
      releaseId,
    );
    if (!release || !snapshot)
      throw new AdminRequestError(
        'conflict',
        'Calculate the draft release before requesting publication approval.',
      );
    if (release.releaseStatus !== 'draft' || release.checksum !== snapshot.checksum)
      throw new AdminRequestError('conflict', 'The release is not an unchanged calculated draft.');
    const payload = { releaseId, checksum: snapshot.checksum, updatedAt: release.updatedAt };
    const approval = await createAdminApprovalRepository(context.env.DB).create({
      actionType: 'release.publish',
      entityType: 'registry_release',
      entityId: releaseId,
      requestedBy: context.get('adminIdentity').email,
      requestedPayload: jsonValue(payload),
      reason: body.reason,
      targetRevision: release.updatedAt,
      expiresAt: expiresInOneDay(context.get('requestTimestamp')),
      requestId: context.get('requestId'),
    });
    return context.json(
      successEnvelope(
        context,
        toAdminApiValue({ approvalRequest: approval, intendedChange: payload }),
      ),
      202,
    );
  });

  async function approvalForRelease(
    context: Context<AdminAppEnv>,
    releaseId: string,
    status: 'pending' | 'approved',
  ) {
    const result = await createAdminApprovalRepository(context.env.DB).list({
      entityType: 'registry_release',
      entityId: releaseId,
      status,
      actionType: 'release.publish',
      page: 1,
      limit: 1,
    });
    const approval = result.items[0];
    if (!approval)
      throw new AdminRequestError(
        'conflict',
        `No ${status} publication approval request exists for this release.`,
      );
    return approval;
  }
  app.post('/api/admin/v1/releases/:releaseId/approve', async (context) => {
    const { releaseId } = parseParams(context, releaseIdParamsSchema);
    const body = await parseBody(context, actionReasonSchema);
    const approval = await approvalForRelease(context, releaseId, 'pending');
    const approved = await createAdminApprovalRepository(context.env.DB).approveRelease(
      approval,
      context.get('adminIdentity').email,
      body.reason,
      context.get('requestId'),
    );
    return context.json(successEnvelope(context, toAdminApiValue(approved)), 200);
  });
  app.post('/api/admin/v1/releases/:releaseId/publish', async (context) => {
    const { releaseId } = parseParams(context, releaseIdParamsSchema);
    await parseBody(context, actionReasonSchema);
    const approval = await approvalForRelease(context, releaseId, 'approved');
    const payload = releaseApprovalPayloadSchema.safeParse(approval.requestedPayload);
    if (!payload.success)
      throw new AdminRequestError('conflict', 'The approved release payload is invalid.');
    const applied = await createAdminApprovalRepository(context.env.DB).publishApprovedRelease(
      approval,
      payload.data,
      context.get('adminIdentity').email,
      context.get('requestId'),
    );
    const release = await createRegistryReleaseRepository(context.env.DB).findById(releaseId);
    return context.json(
      successEnvelope(context, toAdminApiValue({ approvalRequest: applied, release })),
      200,
    );
  });
  app.post('/api/admin/v1/releases/:releaseId/withdraw', async (context) => {
    const { releaseId } = parseParams(context, releaseIdParamsSchema);
    const body = await parseBody(context, actionReasonSchema);
    const repository = createRegistryReleaseRepository(context.env.DB);
    const previous = await repository.findById(releaseId);
    if (!previous) notFound('Registry release');
    const updated = await repository.withdraw(releaseId);
    await appendAudit(context, {
      action: 'release.withdrawn',
      entityType: 'registry_release',
      entityId: releaseId,
      previous,
      next: updated,
      metadata: { reason: body.reason },
    });
    return context.json(successEnvelope(context, toAdminApiValue(updated)), 200);
  });

  app.get('/api/admin/v1/approval-requests', async (context) => {
    const query = parseQuery(context, approvalListQuerySchema);
    const repository = createAdminApprovalRepository(context.env.DB);
    const options = {
      page: query.page,
      limit: query.limit,
      status: query.status,
      actionType: query.action_type,
      entityType: query.entity_type,
      entityId: query.entity_id,
    };
    const [result, total] = await Promise.all([
      repository.list(options),
      repository.count(options),
    ]);
    return context.json(
      {
        data: toAdminApiValue(result.items),
        meta: {
          ...successEnvelope(context, null).meta,
          pagination: paginationMeta(result.page, result.limit, total),
        },
      },
      200,
    );
  });
  app.get('/api/admin/v1/approval-requests/:approvalId', async (context) => {
    const { approvalId } = parseParams(context, approvalIdParamsSchema);
    const repository = createAdminApprovalRepository(context.env.DB);
    const approval = await repository.findById(approvalId);
    if (!approval) notFound('Approval request');
    return context.json(
      successEnvelope(
        context,
        toAdminApiValue({ approval, decisions: await repository.listDecisions(approvalId) }),
      ),
      200,
    );
  });
  app.post('/api/admin/v1/approval-requests/:approvalId/approve', async (context) => {
    const { approvalId } = parseParams(context, approvalIdParamsSchema);
    const body = await parseBody(context, actionReasonSchema);
    const repository = createAdminApprovalRepository(context.env.DB);
    const approval = await repository.findById(approvalId);
    if (!approval) notFound('Approval request');
    if (approval.actionType === 'release.publish') {
      const approved = await repository.approveRelease(
        approval,
        context.get('adminIdentity').email,
        body.reason,
        context.get('requestId'),
      );
      return context.json(successEnvelope(context, toAdminApiValue(approved)), 200);
    }
    requireCriticalPermission(context);
    if (approval.actionType.startsWith('external_profile.')) {
      const payload = externalProfileApprovalPayloadSchema.safeParse(approval.requestedPayload);
      if (!payload.success)
        throw new AdminRequestError(
          'conflict',
          'The critical external-profile approval payload is invalid.',
        );
      const applied = await repository.applyExternalProfile(
        approval,
        payload.data,
        context.get('adminIdentity').email,
        body.reason,
        context.get('requestId'),
      );
      return context.json(successEnvelope(context, toAdminApiValue(applied)), 200);
    }
    const payload = criticalHandlePayloadSchema.safeParse(approval.requestedPayload);
    if (!payload.success)
      throw new AdminRequestError('conflict', 'The critical handle approval payload is invalid.');
    const applied = await repository.applyHandle(
      approval,
      payload.data,
      context.get('adminIdentity').email,
      body.reason,
      context.get('requestId'),
    );
    return context.json(successEnvelope(context, toAdminApiValue(applied)), 200);
  });
  app.post('/api/admin/v1/approval-requests/:approvalId/reject', async (context) => {
    const { approvalId } = parseParams(context, approvalIdParamsSchema);
    const body = await parseBody(context, actionReasonSchema);
    const repository = createAdminApprovalRepository(context.env.DB);
    const approval = await repository.findById(approvalId);
    if (!approval) notFound('Approval request');
    if (approval.actionType !== 'release.publish') requireCriticalPermission(context);
    const rejected = await repository.reject(
      approvalId,
      context.get('adminIdentity').email,
      body.reason,
      context.get('requestId'),
    );
    return context.json(successEnvelope(context, toAdminApiValue(rejected)), 200);
  });

  app.get('/api/admin/v1/audit-logs', async (context) => {
    const query = parseQuery(context, auditListQuerySchema);
    const repository = createAuditLogRepository(context.env.DB);
    const options = {
      page: query.page,
      limit: query.limit,
      action: query.action,
      actorIdentifier: query.administrator,
      entityType: query.entity_type,
      entityId: query.entity_id,
      createdFrom: query.from,
      createdTo: query.to,
    };
    const [result, total] = await Promise.all([
      repository.list(options),
      repository.count(options),
    ]);
    return context.json(
      {
        data: toAdminApiValue(result.items),
        meta: {
          ...successEnvelope(context, null).meta,
          pagination: paginationMeta(result.page, result.limit, total),
        },
      },
      200,
    );
  });
  app.get('/api/admin/v1/audit-logs/:auditLogId', async (context) => {
    const { auditLogId } = parseParams(context, auditLogIdParamsSchema);
    const audit = await createAuditLogRepository(context.env.DB).findById(auditLogId);
    if (!audit) notFound('Audit log');
    return context.json(successEnvelope(context, toAdminApiValue(audit)), 200);
  });

  app.get('/admin-openapi.json', (context) => context.json(createAdminOpenApiDocument(), 200));
  app.get(
    '/admin-docs',
    Scalar({
      url: '/admin-openapi.json',
      pageTitle: 'Open Creator Registry Administration API',
      theme: 'default',
      hideClientButton: true,
      hideModels: false,
      telemetry: false,
      showDeveloperTools: 'never',
      customCss: 'body { margin: 0; }',
    }),
  );

  app.notFound((context) => {
    if (new URL(context.req.url).pathname.startsWith('/api/admin/'))
      return context.json(
        errorEnvelope(
          context,
          'not_found',
          'The requested administration endpoint does not exist.',
        ),
        404,
      );
    return context.notFound();
  });

  app.onError((error, context) => {
    if (error instanceof AdminRequestError) {
      const status =
        error.code === 'authorization_denied'
          ? 403
          : error.code === 'not_found'
            ? 404
            : error.code === 'conflict'
              ? 409
              : error.code === 'bad_request'
                ? 400
                : 422;
      return context.json(errorEnvelope(context, error.code, error.message, error.details), status);
    }
    if (error instanceof AdminImportValidationError) {
      return context.json(errorEnvelope(context, 'validation_failed', error.message), 422);
    }
    if (error instanceof RegistryDatabaseError) {
      const status =
        error.code === 'not_found'
          ? 404
          : error.code === 'unique_constraint' || error.code === 'constraint_violation'
            ? 409
            : error.code === 'invalid_input'
              ? 422
              : 503;
      const code =
        status === 404
          ? 'not_found'
          : status === 409
            ? 'conflict'
            : status === 422
              ? 'validation_failed'
              : 'database_unavailable';
      return context.json(
        errorEnvelope(
          context,
          code,
          status === 503 ? 'The Registry database is unavailable.' : error.message,
        ),
        status,
      );
    }
    console.error(
      JSON.stringify({
        event: 'admin_api_error',
        error_name: error instanceof Error ? error.name : 'UnknownError',
        method: context.req.method,
        path: new URL(context.req.url).pathname,
        request_id: context.get('requestId'),
      }),
    );
    return context.json(
      errorEnvelope(
        context,
        'internal_error',
        'The administration request could not be completed.',
      ),
      500,
    );
  });

  return app;
}
