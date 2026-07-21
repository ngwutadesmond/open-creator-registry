import { createMiddleware } from 'hono/factory';

import { hasAdminPermission, type AdminPermission } from '@open-creator-registry/contracts/admin';

import type { AdminAppEnv } from './app-env';
import { errorEnvelope } from './responses';

type PermissionRule = {
  methods: readonly string[];
  pattern: RegExp;
  permission: AdminPermission;
};

const rules: readonly PermissionRule[] = [
  { methods: ['GET'], pattern: /^\/api\/admin\/v1\/dashboard$/u, permission: 'dashboard:read' },
  {
    methods: ['GET'],
    pattern: /^\/api\/admin\/v1\/creators(?:\/.*)?$/u,
    permission: 'creators:read',
  },
  {
    methods: ['POST', 'PATCH'],
    pattern: /^\/api\/admin\/v1\/creators(?:\/[^/]+)?$/u,
    permission: 'creators:write',
  },
  {
    methods: ['POST', 'PATCH', 'DELETE'],
    pattern: /^\/api\/admin\/v1\/(?:creators\/[^/]+\/aliases|aliases\/[^/]+)$/u,
    permission: 'aliases:write',
  },
  {
    methods: ['POST', 'PATCH', 'DELETE'],
    pattern: /^\/api\/admin\/v1\/(?:creators\/[^/]+\/sources|sources\/[^/]+)$/u,
    permission: 'sources:write',
  },
  {
    methods: ['GET'],
    pattern: /^\/api\/admin\/v1\/reserved-handles(?:\/.*)?$/u,
    permission: 'handles:read',
  },
  {
    methods: ['POST', 'PATCH'],
    pattern: /^\/api\/admin\/v1\/reserved-handles(?:\/.*)?$/u,
    permission: 'handles:write',
  },
  {
    methods: ['GET'],
    pattern: /^\/api\/admin\/v1\/candidates(?:\/.*)?$/u,
    permission: 'candidates:read',
  },
  {
    methods: ['POST'],
    pattern: /^\/api\/admin\/v1\/candidates\/[^/]+\/.+$/u,
    permission: 'candidates:review',
  },
  {
    methods: ['GET'],
    pattern: /^\/api\/admin\/v1\/submissions(?:\/.*)?$/u,
    permission: 'submissions:read',
  },
  {
    methods: ['POST'],
    pattern: /^\/api\/admin\/v1\/submissions\/[^/]+\/.+$/u,
    permission: 'submissions:review',
  },
  {
    methods: ['GET'],
    pattern: /^\/api\/admin\/v1\/imports(?:\/.*)?$/u,
    permission: 'imports:read',
  },
  {
    methods: ['POST'],
    pattern: /^\/api\/admin\/v1\/imports\/preview$/u,
    permission: 'imports:prepare',
  },
  {
    methods: ['POST'],
    pattern: /^\/api\/admin\/v1\/imports\/commit$/u,
    permission: 'imports:commit',
  },
  {
    methods: ['GET'],
    pattern: /^\/api\/admin\/v1\/ingestion-runs(?:\/.*)?$/u,
    permission: 'ingestion_runs:read',
  },
  {
    methods: ['GET'],
    pattern: /^\/api\/admin\/v1\/releases(?:\/.*)?$/u,
    permission: 'releases:read',
  },
  { methods: ['POST'], pattern: /^\/api\/admin\/v1\/releases$/u, permission: 'releases:write' },
  {
    methods: ['POST'],
    pattern: /^\/api\/admin\/v1\/releases\/[^/]+\/(?:calculate|request-approval|withdraw)$/u,
    permission: 'releases:write',
  },
  {
    methods: ['POST'],
    pattern: /^\/api\/admin\/v1\/releases\/[^/]+\/approve$/u,
    permission: 'releases:approve',
  },
  {
    methods: ['POST'],
    pattern: /^\/api\/admin\/v1\/releases\/[^/]+\/publish$/u,
    permission: 'releases:publish',
  },
  {
    methods: ['GET'],
    pattern: /^\/api\/admin\/v1\/approval-requests(?:\/.*)?$/u,
    permission: 'approvals:read',
  },
  {
    methods: ['POST'],
    pattern: /^\/api\/admin\/v1\/approval-requests\/[^/]+\/(?:approve|reject)$/u,
    permission: 'approvals:decide',
  },
  {
    methods: ['GET'],
    pattern: /^\/api\/admin\/v1\/audit-logs(?:\/.*)?$/u,
    permission: 'audit_logs:read',
  },
];

export function permissionForRequest(method: string, path: string): AdminPermission | null {
  return (
    rules.find((rule) => rule.methods.includes(method) && rule.pattern.test(path))?.permission ??
    null
  );
}

export const adminAuthorizationMiddleware = createMiddleware<AdminAppEnv>(async (context, next) => {
  const path = new URL(context.req.url).pathname;
  const permission = permissionForRequest(context.req.method, path);
  if (!permission) {
    await next();
    return;
  }
  const identity = context.get('adminIdentity');
  if (!hasAdminPermission(identity.roles, permission)) {
    return context.json(
      errorEnvelope(
        context,
        'authorization_denied',
        'Your administrator role does not permit this operation.',
      ),
      403,
    );
  }
  await next();
});
