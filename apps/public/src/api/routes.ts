import { Scalar } from '@scalar/hono-api-reference';
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { bodyLimit } from 'hono/body-limit';
import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';

import { RegistryDatabaseError } from '@open-creator-registry/database/errors';
import { createPublicRegistryRepository } from '@open-creator-registry/database/repositories/public-registry-repository';
import { createRegistryReleaseRepository } from '@open-creator-registry/database/repositories/registry-release-repository';

import type { PublicAppEnv, RequestMetadataProvider } from './app-env';
import { defaultRequestMetadataProvider } from './app-env';
import { apiVersion, maximumRequestBodySize, registryDisclaimer, serviceName } from './constants';
import { createHandleCheckService } from './handle-check-service';
import {
  corsMiddleware,
  createRequestContextMiddleware,
  jsonContentTypeMiddleware,
  requestObservabilityMiddleware,
  securityHeadersMiddleware,
} from './middleware';
import {
  DuplicatePublicSubmissionError,
  createPublicRegistryService,
} from './public-registry-service';
import { createRateLimitMiddleware, type PublicRateLimiter } from './rate-limit';
import { errorEnvelope, paginationMeta, successEnvelope } from './responses';
import {
  batchHandleCheckRequestSchema,
  batchHandleCheckResponseSchema,
  creatorAliasesResponseSchema,
  creatorChildrenQuerySchema,
  creatorDetailResponseSchema,
  creatorHandlesResponseSchema,
  creatorIdParamsSchema,
  creatorListQuerySchema,
  creatorListResponseSchema,
  errorEnvelopeSchema,
  handleCheckQuerySchema,
  handleCheckResponseSchema,
  healthResponseSchema,
  publicSubmissionRequestSchema,
  publicSubmissionResponseSchema,
  registryMetaResponseSchema,
  registryReleasesResponseSchema,
  releaseListQuerySchema,
} from './schemas';

const jsonContent = <T extends z.ZodType>(schema: T) => ({
  'application/json': { schema },
});

const commonErrorResponses = {
  403: {
    description: 'The request origin is not in the configured CORS allowlist.',
    content: jsonContent(errorEnvelopeSchema),
  },
  422: { description: 'Request validation failed.', content: jsonContent(errorEnvelopeSchema) },
  429: {
    description: 'A configured rate limiter rejected the request.',
    content: jsonContent(errorEnvelopeSchema),
  },
  500: {
    description: 'An unexpected internal error occurred.',
    content: jsonContent(errorEnvelopeSchema),
  },
  503: {
    description: 'The registry database is unavailable.',
    content: jsonContent(errorEnvelopeSchema),
  },
} as const;

const healthRoute = createRoute({
  method: 'get',
  path: '/api/v1/health',
  tags: ['Health'],
  summary: 'Check service and database health',
  responses: {
    200: {
      description: 'The service and local registry database are available.',
      content: jsonContent(healthResponseSchema),
    },
    503: {
      description: 'The database connectivity check failed.',
      content: jsonContent(healthResponseSchema),
    },
  },
});

const handleCheckRoute = createRoute({
  method: 'get',
  path: '/api/v1/handles/check',
  tags: ['Handles'],
  summary: 'Classify one requested handle',
  description: `Checks only the local Registry database. Match precedence is exact active hard reservation, exact soft reservation, exact monitored reservation, official-handle alias, protected variant, confusable skeleton, approved alias, then not listed. ${registryDisclaimer}`,
  request: { query: handleCheckQuerySchema },
  responses: {
    200: {
      description: 'A protection classification and recommended platform action.',
      content: jsonContent(handleCheckResponseSchema),
    },
    ...commonErrorResponses,
  },
});

const batchHandleCheckRoute = createRoute({
  method: 'post',
  path: '/api/v1/handles/check-batch',
  tags: ['Handles'],
  summary: 'Classify up to 50 requested handles',
  description:
    'The complete body is validated before checking. Any malformed item rejects the complete request. Input order and duplicate inputs are preserved in the response.',
  request: {
    body: { required: true, content: jsonContent(batchHandleCheckRequestSchema) },
  },
  responses: {
    200: {
      description: 'One ordered result for every supplied handle.',
      content: jsonContent(batchHandleCheckResponseSchema),
    },
    400: { description: 'Malformed JSON request.', content: jsonContent(errorEnvelopeSchema) },
    413: { description: 'Request body exceeds 32 KiB.', content: jsonContent(errorEnvelopeSchema) },
    415: {
      description: 'The request is not application/json.',
      content: jsonContent(errorEnvelopeSchema),
    },
    ...commonErrorResponses,
  },
});

const creatorListRoute = createRoute({
  method: 'get',
  path: '/api/v1/creators',
  tags: ['Creators'],
  summary: 'Search approved public creators',
  description:
    'Searches approved creator names, verified aliases, active reserved handles, and verified external source identifiers. The only public review_status value is approved.',
  request: { query: creatorListQuerySchema },
  responses: {
    200: {
      description: 'A deterministic page of public creator summaries.',
      content: jsonContent(creatorListResponseSchema),
    },
    ...commonErrorResponses,
  },
});

const creatorDetailRoute = createRoute({
  method: 'get',
  path: '/api/v1/creators/{creatorId}',
  tags: ['Creators'],
  summary: 'Get one approved public creator',
  request: { params: creatorIdParamsSchema },
  responses: {
    200: {
      description:
        'Public creator fields with verified sources, approved aliases, and active handles.',
      content: jsonContent(creatorDetailResponseSchema),
    },
    404: {
      description: 'The creator does not exist or is not publicly visible.',
      content: jsonContent(errorEnvelopeSchema),
    },
    ...commonErrorResponses,
  },
});

const creatorHandlesRoute = createRoute({
  method: 'get',
  path: '/api/v1/creators/{creatorId}/handles',
  tags: ['Creators'],
  summary: 'List one creator’s active public handles',
  request: { params: creatorIdParamsSchema, query: creatorChildrenQuerySchema },
  responses: {
    200: {
      description: 'A page of active public reserved handles.',
      content: jsonContent(creatorHandlesResponseSchema),
    },
    404: {
      description: 'The creator does not exist or is not publicly visible.',
      content: jsonContent(errorEnvelopeSchema),
    },
    ...commonErrorResponses,
  },
});

const creatorAliasesRoute = createRoute({
  method: 'get',
  path: '/api/v1/creators/{creatorId}/aliases',
  tags: ['Creators'],
  summary: 'List one creator’s verified public aliases',
  request: { params: creatorIdParamsSchema, query: creatorChildrenQuerySchema },
  responses: {
    200: {
      description: 'A page of aliases backed by verified public sources.',
      content: jsonContent(creatorAliasesResponseSchema),
    },
    404: {
      description: 'The creator does not exist or is not publicly visible.',
      content: jsonContent(errorEnvelopeSchema),
    },
    ...commonErrorResponses,
  },
});

const registryMetaRoute = createRoute({
  method: 'get',
  path: '/api/v1/registry/meta',
  tags: ['Registry'],
  summary: 'Get registry metadata and public counts',
  description:
    'A null current_registry_version truthfully means that no release has been published. Demonstration data is explicitly identified and is not a complete global registry.',
  responses: {
    200: {
      description: 'Current public registry metadata.',
      content: jsonContent(registryMetaResponseSchema),
    },
    ...commonErrorResponses,
  },
});

const registryReleasesRoute = createRoute({
  method: 'get',
  path: '/api/v1/registry/releases',
  tags: ['Registry'],
  summary: 'List published registry releases',
  description:
    'Release versions identify published registry decision points. Current and superseded published history is visible; drafts and withdrawn releases are excluded.',
  request: { query: releaseListQuerySchema },
  responses: {
    200: {
      description: 'Published releases, newest first.',
      content: jsonContent(registryReleasesResponseSchema),
    },
    ...commonErrorResponses,
  },
});

const submissionRoute = createRoute({
  method: 'post',
  path: '/api/v1/submissions',
  tags: ['Submissions'],
  summary: 'Submit a creator for human review',
  description:
    'Creates only a pending review record. It never approves a creator or reserves a handle. Equivalent pending submissions receive 409. Submitted URLs are validated syntactically but never fetched.',
  request: { body: { required: true, content: jsonContent(publicSubmissionRequestSchema) } },
  responses: {
    201: {
      description: 'The pending submission was created.',
      content: jsonContent(publicSubmissionResponseSchema),
    },
    400: { description: 'Malformed JSON request.', content: jsonContent(errorEnvelopeSchema) },
    409: {
      description: 'An equivalent pending submission already exists.',
      content: jsonContent(errorEnvelopeSchema),
    },
    413: { description: 'Request body exceeds 32 KiB.', content: jsonContent(errorEnvelopeSchema) },
    415: {
      description: 'The request is not application/json.',
      content: jsonContent(errorEnvelopeSchema),
    },
    ...commonErrorResponses,
  },
});

const openApiConfiguration = {
  openapi: '3.1.0' as const,
  info: {
    title: 'Open Creator Registry API',
    version: apiVersion,
    description: `${registryDisclaimer}\n\nAll endpoints in this specification are public and require no authentication. Production rate limiting and bot protection depend on deployment configuration; local development does not pretend to provide distributed enforcement. registration_may_continue means account creation may continue with a temporary platform username, not that the requested handle should be assigned.`,
  },
  servers: [
    { url: 'http://localhost:5173', description: 'Local public Worker' },
    {
      url: 'https://registry.example.com',
      description: 'Illustrative production hostname; configure in Phase 7',
    },
  ],
  tags: [
    { name: 'Health', description: 'Service and database health.' },
    { name: 'Handles', description: 'Local, deterministic handle-protection classification.' },
    { name: 'Creators', description: 'Approved public creator records.' },
    { name: 'Registry', description: 'Registry version and release metadata.' },
    { name: 'Submissions', description: 'Public suggestions that always enter human review.' },
    { name: 'Documentation', description: 'Generated specification and interactive reference.' },
  ],
  security: [],
};

export type PublicAppDependencies = {
  metadata?: RequestMetadataProvider;
  rateLimiter?: PublicRateLimiter;
};

export function createPublicApp(dependencies: PublicAppDependencies = {}) {
  const metadata = dependencies.metadata ?? defaultRequestMetadataProvider;
  const rateLimiter = dependencies.rateLimiter;
  const app = new OpenAPIHono<PublicAppEnv>({
    defaultHook: (result, context) => {
      if (result.success) return;
      const details = result.error.issues.map((issue) => ({
        code: issue.code,
        message: issue.message,
        path: issue.path.join('.'),
      }));
      return context.json(
        errorEnvelope(context, 'validation_failed', 'The request could not be processed.', details),
        422,
      );
    },
  });

  const requestTooLargeResponse = (untypedContext: Context) => {
    const context = untypedContext as Context<PublicAppEnv>;
    return context.json(
      errorEnvelope(context, 'request_too_large', 'The request body exceeds 32 KiB.'),
      413,
    );
  };

  app.use('*', createRequestContextMiddleware(metadata));
  app.use('*', requestObservabilityMiddleware);
  app.use('*', securityHeadersMiddleware);
  app.use('/api/v1/*', corsMiddleware);
  app.use('/openapi.json', corsMiddleware);
  app.use('/docs', corsMiddleware);
  app.use('/api/v1/*', createRateLimitMiddleware(rateLimiter));
  app.use(
    '/api/v1/handles/check-batch',
    bodyLimit({
      maxSize: maximumRequestBodySize,
      onError: requestTooLargeResponse,
    }),
  );
  app.use(
    '/api/v1/submissions',
    bodyLimit({
      maxSize: maximumRequestBodySize,
      onError: requestTooLargeResponse,
    }),
  );
  app.use('/api/v1/handles/check-batch', jsonContentTypeMiddleware);
  app.use('/api/v1/submissions', jsonContentTypeMiddleware);

  app.openapi(healthRoute, async (context) => {
    const service = createPublicRegistryService(context.env.DB);
    try {
      const [connected, release, migrations] = await Promise.all([
        service.checkConnectivity(),
        createRegistryReleaseRepository(context.env.DB).findLatestPublished(),
        createPublicRegistryRepository(context.env.DB).getMigrationCompatibility(),
      ]);
      context.header('Cache-Control', 'no-store');
      if (!connected) {
        return context.json(
          successEnvelope(context, {
            service: serviceName,
            status: 'unavailable' as const,
            api_version: apiVersion,
            environment: context.env.ENVIRONMENT,
            database: { status: 'unavailable' as const },
            migrations: { status: 'unavailable' as const },
            registry_version: release?.version ?? null,
          }),
          503,
        );
      }
      const compatible = migrations.status === 'compatible';
      return context.json(
        successEnvelope(context, {
          service: serviceName,
          status: compatible ? ('ok' as const) : ('unavailable' as const),
          api_version: apiVersion,
          environment: context.env.ENVIRONMENT,
          database: { status: 'connected' as const },
          migrations: { status: migrations.status },
          registry_version: release?.version ?? null,
        }),
        compatible ? 200 : 503,
      );
    } catch (error) {
      console.error(
        JSON.stringify({
          event: 'public_api_health_failure',
          code: 'database_unavailable',
          error_name: error instanceof Error ? error.name : 'UnknownError',
          method: context.req.method,
          path: new URL(context.req.url).pathname,
          request_id: context.get('requestId'),
        }),
      );
      context.header('Cache-Control', 'no-store');
      return context.json(
        successEnvelope(context, {
          service: serviceName,
          status: 'unavailable' as const,
          api_version: apiVersion,
          environment: context.env.ENVIRONMENT,
          database: { status: 'unavailable' as const },
          migrations: { status: 'unavailable' as const },
          registry_version: null,
        }),
        503,
      );
    }
  });

  app.openapi(handleCheckRoute, async (context) => {
    const { handle } = context.req.valid('query');
    const result = await createHandleCheckService(context.env.DB).check(handle);
    context.header('Cache-Control', 'public, max-age=0, s-maxage=60, must-revalidate');
    return context.json(successEnvelope(context, result), 200);
  });

  app.openapi(batchHandleCheckRoute, async (context) => {
    const { handles } = context.req.valid('json');
    const checked = await createHandleCheckService(context.env.DB).checkMany(handles);
    const results = checked.results.map((result) => ({
      input: result.input,
      normalized_handle: result.normalized_handle,
      registry_status: result.registry_status,
      recommended_action: result.recommended_action,
      claim_allowed: result.claim_allowed,
      registration_may_continue: result.registration_may_continue,
      matched_by: result.matched_by,
      confidence_score: result.confidence_score,
      ambiguous: result.ambiguous,
      creator: result.creator,
      reservation_status: result.reservation_status,
    }));
    context.header('Cache-Control', 'no-store');
    return context.json(
      successEnvelope(context, {
        results,
        registry: {
          version: checked.registryVersion,
          last_updated_at: checked.registryLastUpdatedAt,
        },
      }),
      200,
    );
  });

  app.openapi(creatorListRoute, async (context) => {
    const query = context.req.valid('query');
    const result = await createPublicRegistryService(context.env.DB).listCreators({
      query: query.query,
      category: query.category,
      country: query.country,
      protectionTier: query.protection_tier,
      source: query.source,
      page: query.page,
      limit: query.limit,
      sort: query.sort,
      order: query.order,
    });
    context.header('Cache-Control', 'public, max-age=60, s-maxage=300');
    return context.json(
      {
        data: result.items,
        pagination: paginationMeta(result.page, result.limit, result.total),
        meta: successEnvelope(context, null).meta,
      },
      200,
    );
  });

  app.openapi(creatorDetailRoute, async (context) => {
    const { creatorId } = context.req.valid('param');
    const creator = await createPublicRegistryService(context.env.DB).getCreatorDetail(creatorId);
    context.header('Cache-Control', 'public, max-age=60, s-maxage=300');
    return context.json(successEnvelope(context, creator), 200);
  });

  app.openapi(creatorHandlesRoute, async (context) => {
    const { creatorId } = context.req.valid('param');
    const { page, limit } = context.req.valid('query');
    const result = await createPublicRegistryService(context.env.DB).listCreatorHandles(
      creatorId,
      page,
      limit,
    );
    context.header('Cache-Control', 'public, max-age=60, s-maxage=300');
    return context.json(
      {
        data: result.items,
        pagination: paginationMeta(result.page, result.limit, result.total),
        meta: successEnvelope(context, null).meta,
      },
      200,
    );
  });

  app.openapi(creatorAliasesRoute, async (context) => {
    const { creatorId } = context.req.valid('param');
    const { page, limit } = context.req.valid('query');
    const result = await createPublicRegistryService(context.env.DB).listCreatorAliases(
      creatorId,
      page,
      limit,
    );
    context.header('Cache-Control', 'public, max-age=60, s-maxage=300');
    return context.json(
      {
        data: result.items,
        pagination: paginationMeta(result.page, result.limit, result.total),
        meta: successEnvelope(context, null).meta,
      },
      200,
    );
  });

  app.openapi(registryMetaRoute, async (context) => {
    const data = await createPublicRegistryService(context.env.DB).getRegistryMetadata(
      context.env.ENVIRONMENT === 'local',
    );
    context.header('Cache-Control', 'public, max-age=60, s-maxage=300');
    return context.json(successEnvelope(context, data), 200);
  });

  app.openapi(registryReleasesRoute, async (context) => {
    const { page, limit } = context.req.valid('query');
    const result = await createPublicRegistryService(context.env.DB).listPublishedReleases(
      page,
      limit,
    );
    context.header('Cache-Control', 'public, max-age=60, s-maxage=300');
    return context.json(
      {
        data: result.items,
        pagination: paginationMeta(result.page, result.limit, result.total),
        meta: successEnvelope(context, null).meta,
      },
      200,
    );
  });

  app.openapi(submissionRoute, async (context) => {
    const body = context.req.valid('json');
    try {
      const submission = await createPublicRegistryService(context.env.DB).createSubmission({
        creatorName: body.creator_name,
        category: body.category,
        countryCodes: body.country_codes,
        requestedHandles: body.requested_handles,
        publicSources: body.public_sources,
      });
      context.header('Cache-Control', 'no-store');
      return context.json(
        successEnvelope(context, {
          id: submission.id,
          submission_status: 'pending' as const,
          created_at: submission.createdAt,
          message: 'The submission was received for human review. No handle was reserved.',
        }),
        201,
      );
    } catch (error) {
      if (error instanceof DuplicatePublicSubmissionError) {
        return context.json(
          errorEnvelope(context, 'conflict', 'An equivalent pending submission already exists.'),
          409,
        );
      }
      throw error;
    }
  });

  app.openAPIRegistry.registerPath({
    method: 'get',
    path: '/openapi.json',
    tags: ['Documentation'],
    summary: 'Get the generated OpenAPI document',
    responses: {
      200: {
        description: 'The OpenAPI 3.1 document generated from registered route schemas.',
        content: jsonContent(z.record(z.string(), z.unknown())),
      },
    },
  });
  app.openAPIRegistry.registerPath({
    method: 'get',
    path: '/docs',
    tags: ['Documentation'],
    summary: 'Open the interactive API reference',
    responses: {
      200: {
        description: 'Interactive Scalar documentation backed by /openapi.json.',
        content: { 'text/html': { schema: z.string() } },
      },
    },
  });

  app.doc('/openapi.json', (context) => ({
    ...openApiConfiguration,
    servers: [
      {
        url: context.env.API_DOCUMENTATION_SERVER ?? new URL(context.req.url).origin,
        description: `${context.env.ENVIRONMENT} public Worker`,
      },
    ],
  }));
  app.get(
    '/docs',
    Scalar<PublicAppEnv>((context) => ({
      agent: { disabled: true },
      cdn: '/vendor/scalar/standalone.js',
      nonce: context.get('cspNonce'),
      pageTitle: 'Open Creator Registry API',
      showDeveloperTools: 'never',
      telemetry: false,
      theme: 'default',
      url: '/openapi.json',
      withDefaultFonts: false,
    })),
  );

  const methodPolicy = new Map<string, string>([
    ['/api/v1/health', 'GET'],
    ['/api/v1/handles/check', 'GET'],
    ['/api/v1/handles/check-batch', 'POST'],
    ['/api/v1/creators', 'GET'],
    ['/api/v1/registry/meta', 'GET'],
    ['/api/v1/registry/releases', 'GET'],
    ['/api/v1/submissions', 'POST'],
    ['/openapi.json', 'GET'],
    ['/docs', 'GET'],
  ]);

  app.all('*', (context) => {
    const pathname = new URL(context.req.url).pathname;
    const dynamicCreatorPath = /^\/api\/v1\/creators\/[^/]+(?:\/(?:handles|aliases))?$/u.test(
      pathname,
    );
    const allowed = methodPolicy.get(pathname) ?? (dynamicCreatorPath ? 'GET' : null);
    if (allowed) {
      context.header('Allow', allowed);
      return context.json(
        errorEnvelope(context, 'method_not_allowed', 'The HTTP method is not allowed here.'),
        405,
      );
    }
    if (
      !pathname.startsWith('/api/') &&
      (context.req.method === 'GET' || context.req.method === 'HEAD') &&
      context.env.ASSETS
    ) {
      return context.env.ASSETS.fetch(context.req.raw);
    }
    return context.json(
      errorEnvelope(context, 'not_found', 'The requested resource was not found.'),
      404,
    );
  });

  app.onError((error, context) => {
    if (error instanceof SyntaxError || (error instanceof HTTPException && error.status === 400)) {
      return context.json(
        errorEnvelope(context, 'bad_request', 'The request body is not valid JSON.'),
        400,
      );
    }
    if (error instanceof RegistryDatabaseError) {
      if (error.code === 'not_found') {
        return context.json(
          errorEnvelope(context, 'not_found', 'The requested public resource was not found.'),
          404,
        );
      }
      if (error.code === 'unique_constraint') {
        return context.json(
          errorEnvelope(context, 'conflict', 'A conflicting registry record already exists.'),
          409,
        );
      }
      if (error.code === 'invalid_input' || error.code === 'constraint_violation') {
        return context.json(
          errorEnvelope(context, 'validation_failed', 'The request could not be processed.'),
          422,
        );
      }
      console.error(
        JSON.stringify({
          event: 'public_api_error',
          code: error.code,
          method: context.req.method,
          path: new URL(context.req.url).pathname,
          request_id: context.get('requestId'),
        }),
      );
      return context.json(
        errorEnvelope(context, 'database_unavailable', 'The registry database is unavailable.'),
        503,
      );
    }

    console.error(
      JSON.stringify({
        event: 'public_api_error',
        code: 'internal_error',
        error_name: error.name,
        method: context.req.method,
        path: new URL(context.req.url).pathname,
        request_id: context.get('requestId'),
      }),
    );
    return context.json(
      errorEnvelope(context, 'internal_error', 'An unexpected internal error occurred.'),
      500,
    );
  });

  return app;
}

export function createOpenApiDocument() {
  return createPublicApp().getOpenAPI31Document(openApiConfiguration);
}
