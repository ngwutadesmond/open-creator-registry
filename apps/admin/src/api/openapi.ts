import { z } from '@hono/zod-openapi';

import {
  actionReasonSchema,
  aliasInputSchema,
  aliasPatchSchema,
  approvalListQuerySchema,
  auditListQuerySchema,
  candidateApproveSchema,
  candidateDecisionSchema,
  candidateListQuerySchema,
  candidateMergeSchema,
  conflictCheckSchema,
  creatorInputSchema,
  creatorListQuerySchema,
  creatorPatchSchema,
  externalProfileConflictSchema,
  externalProfileInputSchema,
  externalProfilePatchSchema,
  handleInputSchema,
  handleListQuerySchema,
  handlePatchSchema,
  identitySwitchSchema,
  importCommitSchema,
  importListQuerySchema,
  importPreviewSchema,
  ingestionListQuerySchema,
  ingestionStartSchema,
  releaseCreateSchema,
  releaseListQuerySchema,
  reviewDecisionSchema,
  sourceInputSchema,
  sourcePatchSchema,
  sourceConfigurationPatchSchema,
  submissionListQuerySchema,
} from './schemas';

type RouteContract = {
  method: 'get' | 'post' | 'patch' | 'delete';
  path: string;
  summary: string;
  tag: string;
  body?: z.ZodType;
  query?: z.ZodType;
};

const routes: RouteContract[] = [
  {
    method: 'get',
    path: '/api/admin/v1/health',
    summary: 'Check the private Worker and D1 binding',
    tag: 'System',
  },
  {
    method: 'get',
    path: '/api/admin/v1/me',
    summary: 'Read the authenticated administrator identity',
    tag: 'System',
  },
  {
    method: 'post',
    path: '/api/admin/v1/development/identity',
    summary: 'Switch between configured local test administrators',
    tag: 'System',
    body: identitySwitchSchema,
  },
  {
    method: 'get',
    path: '/api/admin/v1/dashboard',
    summary: 'Read operational Registry metrics',
    tag: 'Dashboard',
  },
  {
    method: 'get',
    path: '/api/admin/v1/creators',
    summary: 'List and search creators',
    tag: 'Creators',
    query: creatorListQuerySchema,
  },
  {
    method: 'post',
    path: '/api/admin/v1/creators',
    summary: 'Create a creator',
    tag: 'Creators',
    body: creatorInputSchema,
  },
  {
    method: 'get',
    path: '/api/admin/v1/creators/{creatorId}',
    summary: 'Read one creator and related evidence',
    tag: 'Creators',
  },
  {
    method: 'patch',
    path: '/api/admin/v1/creators/{creatorId}',
    summary: 'Update one creator',
    tag: 'Creators',
    body: creatorPatchSchema,
  },
  {
    method: 'get',
    path: '/api/admin/v1/creators/{creatorId}/aliases',
    summary: 'List creator aliases',
    tag: 'Aliases',
  },
  {
    method: 'post',
    path: '/api/admin/v1/creators/{creatorId}/aliases',
    summary: 'Create a creator alias',
    tag: 'Aliases',
    body: aliasInputSchema,
  },
  {
    method: 'patch',
    path: '/api/admin/v1/aliases/{aliasId}',
    summary: 'Update an alias',
    tag: 'Aliases',
    body: aliasPatchSchema,
  },
  {
    method: 'delete',
    path: '/api/admin/v1/aliases/{aliasId}',
    summary: 'Delete an alias after confirmation',
    tag: 'Aliases',
  },
  {
    method: 'get',
    path: '/api/admin/v1/creators/{creatorId}/sources',
    summary: 'List public creator sources',
    tag: 'Sources',
  },
  {
    method: 'get',
    path: '/api/admin/v1/creators/{creatorId}/profiles',
    summary: 'List creator platform profiles and provenance',
    tag: 'External profiles',
  },
  {
    method: 'post',
    path: '/api/admin/v1/creators/{creatorId}/profiles',
    summary: 'Create or request approval for an external profile',
    tag: 'External profiles',
    body: externalProfileInputSchema,
  },
  {
    method: 'get',
    path: '/api/admin/v1/external-profiles/{profileId}',
    summary: 'Read an external profile and its provenance',
    tag: 'External profiles',
  },
  {
    method: 'patch',
    path: '/api/admin/v1/external-profiles/{profileId}',
    summary: 'Update or request approval for an external profile',
    tag: 'External profiles',
    body: externalProfilePatchSchema,
  },
  {
    method: 'delete',
    path: '/api/admin/v1/external-profiles/{profileId}',
    summary: 'Safely suppress or request approval to suppress a profile',
    tag: 'External profiles',
  },
  {
    method: 'post',
    path: '/api/admin/v1/external-profiles/check-conflicts',
    summary: 'Inspect stable-account, URL, primary, and source conflicts',
    tag: 'External profiles',
    body: externalProfileConflictSchema,
  },
  {
    method: 'post',
    path: '/api/admin/v1/creators/{creatorId}/sources',
    summary: 'Create a public creator source',
    tag: 'Sources',
    body: sourceInputSchema,
  },
  {
    method: 'patch',
    path: '/api/admin/v1/sources/{sourceId}',
    summary: 'Update a public creator source',
    tag: 'Sources',
    body: sourcePatchSchema,
  },
  {
    method: 'delete',
    path: '/api/admin/v1/sources/{sourceId}',
    summary: 'Delete an unreferenced public source',
    tag: 'Sources',
  },
  {
    method: 'get',
    path: '/api/admin/v1/reserved-handles',
    summary: 'List reserved handles',
    tag: 'Handles',
    query: handleListQuerySchema,
  },
  {
    method: 'post',
    path: '/api/admin/v1/reserved-handles',
    summary: 'Create or request approval for a reserved handle',
    tag: 'Handles',
    body: handleInputSchema,
  },
  {
    method: 'get',
    path: '/api/admin/v1/reserved-handles/{handleId}',
    summary: 'Read one reserved handle',
    tag: 'Handles',
  },
  {
    method: 'patch',
    path: '/api/admin/v1/reserved-handles/{handleId}',
    summary: 'Update or request approval for a reserved handle',
    tag: 'Handles',
    body: handlePatchSchema,
  },
  ...(['suspend', 'release', 'restore'] as const).map((action) => ({
    method: 'post' as const,
    path: `/api/admin/v1/reserved-handles/{handleId}/${action}`,
    summary: `${action[0]?.toUpperCase() ?? ''}${action.slice(1)} a reserved handle`,
    tag: 'Handles',
    body: actionReasonSchema,
  })),
  {
    method: 'post',
    path: '/api/admin/v1/reserved-handles/check-conflicts',
    summary: 'Preview exact, alias and confusable conflicts',
    tag: 'Handles',
    body: conflictCheckSchema,
  },
  {
    method: 'get',
    path: '/api/admin/v1/candidates',
    summary: 'List creator candidates',
    tag: 'Candidates',
    query: candidateListQuerySchema,
  },
  {
    method: 'get',
    path: '/api/admin/v1/candidates/{candidateId}',
    summary: 'Read one creator candidate',
    tag: 'Candidates',
  },
  {
    method: 'post',
    path: '/api/admin/v1/candidates/{candidateId}/approve',
    summary: 'Approve a candidate without creating handles',
    tag: 'Candidates',
    body: candidateApproveSchema,
  },
  {
    method: 'post',
    path: '/api/admin/v1/candidates/{candidateId}/reject',
    summary: 'Reject a candidate',
    tag: 'Candidates',
    body: candidateDecisionSchema,
  },
  {
    method: 'post',
    path: '/api/admin/v1/candidates/{candidateId}/merge',
    summary: 'Merge a candidate into an existing creator',
    tag: 'Candidates',
    body: candidateMergeSchema,
  },
  {
    method: 'post',
    path: '/api/admin/v1/candidates/{candidateId}/request-review',
    summary: 'Return a candidate to pending review',
    tag: 'Candidates',
    body: candidateDecisionSchema,
  },
  {
    method: 'get',
    path: '/api/admin/v1/submissions',
    summary: 'List public submissions',
    tag: 'Submissions',
    query: submissionListQuerySchema,
  },
  {
    method: 'get',
    path: '/api/admin/v1/submissions/{submissionId}',
    summary: 'Read one public submission',
    tag: 'Submissions',
  },
  ...(['start-review', 'approve', 'reject', 'convert-to-candidate'] as const).map((action) => ({
    method: 'post' as const,
    path: `/api/admin/v1/submissions/{submissionId}/${action}`,
    summary: `${action} a public submission`,
    tag: 'Submissions',
    body: reviewDecisionSchema,
  })),
  {
    method: 'post',
    path: '/api/admin/v1/imports/preview',
    summary: 'Validate a bounded CSV or JSON import without live mutation',
    tag: 'Imports',
    body: importPreviewSchema,
  },
  {
    method: 'post',
    path: '/api/admin/v1/imports/commit',
    summary: 'Commit an unchanged validated import',
    tag: 'Imports',
    body: importCommitSchema,
  },
  {
    method: 'get',
    path: '/api/admin/v1/imports',
    summary: 'List import batches',
    tag: 'Imports',
    query: importListQuerySchema,
  },
  {
    method: 'get',
    path: '/api/admin/v1/imports/{importId}',
    summary: 'Read one import batch and its row errors',
    tag: 'Imports',
  },
  {
    method: 'get',
    path: '/api/admin/v1/source-configurations',
    summary: 'List reviewed connector configurations, checkpoints, and locks',
    tag: 'Ingestion',
  },
  {
    method: 'get',
    path: '/api/admin/v1/source-configurations/{sourceName}',
    summary: 'Read a reviewed connector configuration',
    tag: 'Ingestion',
  },
  {
    method: 'patch',
    path: '/api/admin/v1/source-configurations/{sourceName}',
    summary: 'Update a reviewed connector configuration',
    tag: 'Ingestion',
    body: sourceConfigurationPatchSchema,
  },
  {
    method: 'post',
    path: '/api/admin/v1/ingestion-runs/preview',
    summary: 'Preview a bounded connector run without candidate mutation',
    tag: 'Ingestion',
    body: ingestionStartSchema,
  },
  {
    method: 'post',
    path: '/api/admin/v1/ingestion-runs/start',
    summary: 'Start one bounded ingestion run',
    tag: 'Ingestion',
    body: ingestionStartSchema,
  },
  {
    method: 'get',
    path: '/api/admin/v1/ingestion-runs',
    summary: 'List ingestion runs',
    tag: 'Ingestion',
    query: ingestionListQuerySchema,
  },
  {
    method: 'get',
    path: '/api/admin/v1/ingestion-runs/{runId}',
    summary: 'Read one ingestion run and bounded record outcomes',
    tag: 'Ingestion',
  },
  {
    method: 'get',
    path: '/api/admin/v1/ingestion-runs/{runId}/records',
    summary: 'Read bounded per-record ingestion outcomes',
    tag: 'Ingestion',
  },
  {
    method: 'get',
    path: '/api/admin/v1/source-checkpoints',
    summary: 'List connector checkpoints',
    tag: 'Ingestion',
  },
  {
    method: 'post',
    path: '/api/admin/v1/source-checkpoints/{checkpointId}/reset',
    summary: 'Reset a checkpoint after administrator confirmation',
    tag: 'Ingestion',
    body: actionReasonSchema,
  },
  {
    method: 'post',
    path: '/api/admin/v1/source-locks/{sourceName}/{scopeKey}/force-release',
    summary: 'Force-release a source lease with super-administrator audit',
    tag: 'Ingestion',
    body: actionReasonSchema,
  },
  {
    method: 'get',
    path: '/api/admin/v1/releases',
    summary: 'List registry releases',
    tag: 'Releases',
    query: releaseListQuerySchema,
  },
  {
    method: 'post',
    path: '/api/admin/v1/releases',
    summary: 'Create a release draft',
    tag: 'Releases',
    body: releaseCreateSchema,
  },
  {
    method: 'get',
    path: '/api/admin/v1/releases/{releaseId}',
    summary: 'Read a release, snapshot and approval state',
    tag: 'Releases',
  },
  ...(['calculate', 'request-approval', 'approve', 'publish', 'withdraw'] as const).map(
    (action) => ({
      method: 'post' as const,
      path: `/api/admin/v1/releases/{releaseId}/${action}`,
      summary: `${action} a registry release`,
      tag: 'Releases',
      body: actionReasonSchema,
    }),
  ),
  {
    method: 'get',
    path: '/api/admin/v1/approval-requests',
    summary: 'List critical-change approval requests',
    tag: 'Approvals',
    query: approvalListQuerySchema,
  },
  {
    method: 'get',
    path: '/api/admin/v1/approval-requests/{approvalId}',
    summary: 'Read an approval request and decisions',
    tag: 'Approvals',
  },
  {
    method: 'post',
    path: '/api/admin/v1/approval-requests/{approvalId}/approve',
    summary: 'Approve as a different authorised administrator',
    tag: 'Approvals',
    body: actionReasonSchema,
  },
  {
    method: 'post',
    path: '/api/admin/v1/approval-requests/{approvalId}/reject',
    summary: 'Reject as a different authorised administrator',
    tag: 'Approvals',
    body: actionReasonSchema,
  },
  {
    method: 'get',
    path: '/api/admin/v1/audit-logs',
    summary: 'Search append-only audit logs',
    tag: 'Audit',
    query: auditListQuerySchema,
  },
  {
    method: 'get',
    path: '/api/admin/v1/audit-logs/{auditLogId}',
    summary: 'Read one append-only audit entry',
    tag: 'Audit',
  },
];

function jsonSchema(schema: z.ZodType): Record<string, unknown> {
  return z.toJSONSchema(schema, { target: 'draft-7', unrepresentable: 'any' });
}

export function createAdminOpenApiDocument(serverUrl = 'http://localhost:5174') {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const route of routes) {
    const operation: Record<string, unknown> = {
      tags: [route.tag],
      summary: route.summary,
      security: [{ cloudflareAccess: [] }, { localDevelopmentCookie: [] }],
      responses: {
        200: { description: 'Successful administration response with data and request metadata.' },
        401: { description: 'Authentication is missing or not configured.' },
        403: { description: 'The administrator lacks the required permission.' },
        422: { description: 'Zod validation rejected the request.' },
        500: { description: 'A safe internal error envelope.' },
      },
    };
    if (route.body) {
      operation.requestBody = {
        required: true,
        content: { 'application/json': { schema: jsonSchema(route.body) } },
      };
    }
    if (route.query) operation['x-query-schema'] = jsonSchema(route.query);
    const pathItem = paths[route.path] ?? {};
    pathItem[route.method] = operation;
    paths[route.path] = pathItem;
  }
  return {
    openapi: '3.1.0',
    info: {
      title: 'Open Creator Registry Administration API',
      version: '1.0.0',
      description:
        'Private API. Local development uses two configured identities. Staging and production require a cryptographically validated Cloudflare Access JWT plus server-side email allowlisting and role mapping. Critical changes require a different authorised approver before protected handles or registry releases can become live. Imports are limited to 500 records and 256 KiB. Every response includes a request ID.',
    },
    servers: [{ url: serverUrl, description: 'Current private administration Worker' }],
    security: [{ cloudflareAccess: [] }, { localDevelopmentCookie: [] }],
    tags: [...new Set(routes.map((route) => route.tag))].map((name) => ({ name })),
    components: {
      securitySchemes: {
        cloudflareAccess: {
          type: 'apiKey',
          in: 'header',
          name: 'Cf-Access-Jwt-Assertion',
          description:
            'JWT injected by Cloudflare Access and cryptographically revalidated by the Worker. Never copy this token into client storage.',
        },
        localDevelopmentCookie: {
          type: 'apiKey',
          in: 'cookie',
          name: 'ocr_dev_admin',
          description: 'Local-only selector for one of two server-configured test identities.',
        },
      },
    },
    paths,
  };
}
