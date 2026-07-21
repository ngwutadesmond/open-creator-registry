import type { Context } from 'hono';
import { setCookie } from 'hono/cookie';
import { createMiddleware } from 'hono/factory';
import { z } from 'zod';

import {
  adminRoles,
  permissionsForRoles,
  type AdminIdentity,
  type AdminRole,
} from '@open-creator-registry/contracts/admin';

import type { AdminAppEnv, AdminRuntimeBindings } from './app-env';
import { errorEnvelope } from './responses';

const localAdminSlotSchema = z.enum(['primary', 'secondary']);
export type LocalAdminSlot = z.infer<typeof localAdminSlotSchema>;

export class AdminAuthenticationError extends Error {
  constructor(
    readonly code: 'authentication_required' | 'authentication_unavailable',
    message: string,
  ) {
    super(message);
    this.name = 'AdminAuthenticationError';
  }
}

export interface AdminAuthenticationProvider {
  authenticate(request: Request, bindings: AdminRuntimeBindings): Promise<AdminIdentity>;
}

function parseRoles(value: string | undefined): AdminRole[] {
  if (!value) {
    throw new AdminAuthenticationError(
      'authentication_unavailable',
      'Local administrator roles are not configured.',
    );
  }
  const parsed = value
    .split(',')
    .map((role) => role.trim())
    .filter(Boolean);
  const roles = z.array(z.enum(adminRoles)).min(1).safeParse(parsed);
  if (!roles.success) {
    throw new AdminAuthenticationError(
      'authentication_unavailable',
      'Local administrator roles contain an unsupported value.',
    );
  }
  return roles.data;
}

function configuredIdentity(bindings: AdminRuntimeBindings, slot: LocalAdminSlot): AdminIdentity {
  const secondary = slot === 'secondary';
  const email = secondary ? bindings.DEV_ADMIN_SECONDARY_EMAIL : bindings.DEV_ADMIN_EMAIL;
  const displayName = secondary ? bindings.DEV_ADMIN_SECONDARY_NAME : bindings.DEV_ADMIN_NAME;
  const roleValue = secondary ? bindings.DEV_ADMIN_SECONDARY_ROLES : bindings.DEV_ADMIN_ROLES;
  if (!email || !displayName) {
    throw new AdminAuthenticationError(
      'authentication_unavailable',
      `The ${slot} local administrator is not fully configured.`,
    );
  }
  const roles = parseRoles(roleValue);
  return {
    subject: `local:${email.trim().toLowerCase()}`,
    email: email.trim().toLowerCase(),
    displayName: displayName.trim(),
    roles,
    permissions: permissionsForRoles(roles),
    authenticationSource: 'local_development',
  };
}

export const localDevelopmentAuthenticationProvider: AdminAuthenticationProvider = {
  authenticate(request, bindings) {
    if (bindings.ENVIRONMENT !== 'local' || bindings.AUTH_PROVIDER !== 'local_development') {
      throw new AdminAuthenticationError(
        'authentication_required',
        'Local administrator authentication is disabled outside the explicit local environment.',
      );
    }
    const cookieSlot = request.headers
      .get('Cookie')
      ?.split(';')
      .map((part) => part.trim().split('='))
      .find(([name]) => name === 'ocr_dev_admin')?.[1];
    const configuredSlot = localAdminSlotSchema.safeParse(cookieSlot ?? bindings.DEV_ADMIN_ACTIVE);
    const slot = configuredSlot.success ? configuredSlot.data : 'primary';
    return Promise.resolve(configuredIdentity(bindings, slot));
  },
};

export class CloudflareAccessAuthenticationProvider implements AdminAuthenticationProvider {
  authenticate(request: Request, bindings: AdminRuntimeBindings): Promise<AdminIdentity> {
    void request;
    void bindings;
    return Promise.reject(
      new AdminAuthenticationError(
        'authentication_unavailable',
        'Cloudflare Access JWT verification is not implemented until Phase 7.',
      ),
    );
  }
}

export async function authenticateAdmin(
  request: Request,
  bindings: AdminRuntimeBindings,
): Promise<AdminIdentity> {
  if (bindings.AUTH_PROVIDER === 'local_development') {
    return localDevelopmentAuthenticationProvider.authenticate(request, bindings);
  }
  if (bindings.AUTH_PROVIDER === 'cloudflare_access') {
    return new CloudflareAccessAuthenticationProvider().authenticate(request, bindings);
  }
  throw new AdminAuthenticationError(
    'authentication_required',
    'Administrator authentication is not configured. Access is denied by default.',
  );
}

export const adminAuthenticationMiddleware = createMiddleware<AdminAppEnv>(
  async (context, next) => {
    try {
      const identity = await authenticateAdmin(context.req.raw, context.env);
      context.set('adminIdentity', identity);
      await next();
    } catch (error) {
      if (error instanceof AdminAuthenticationError) {
        return context.json(
          errorEnvelope(context, error.code, error.message),
          error.code === 'authentication_required' ? 401 : 503,
        );
      }
      throw error;
    }
  },
);

export function switchLocalAdministrator(context: Context<AdminAppEnv>, slot: unknown) {
  const parsed = localAdminSlotSchema.safeParse(slot);
  if (!parsed.success) return false;
  setCookie(context, 'ocr_dev_admin', parsed.data, {
    httpOnly: true,
    path: '/',
    sameSite: 'Strict',
    secure: new URL(context.req.url).protocol === 'https:',
    maxAge: 8 * 60 * 60,
  });
  return true;
}
