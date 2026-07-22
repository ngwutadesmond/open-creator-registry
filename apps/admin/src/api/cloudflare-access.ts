import {
  createRemoteJWKSet,
  customFetch,
  jwtVerify,
  type FetchImplementation,
  type JWTVerifyGetKey,
} from 'jose';
import { z } from 'zod';

import {
  adminRoles,
  permissionsForRoles,
  type AdminIdentity,
  type AdminRole,
} from '@open-creator-registry/contracts/admin';

import type { AdminRuntimeBindings } from './app-env';
import { AdminAuthenticationError } from './authentication-error';

const accessClaimsSchema = z.object({
  sub: z.string().min(1),
  email: z.string().email(),
  name: z.string().trim().min(1).optional(),
});

const roleMappingSchema = z.record(z.string().email(), z.array(z.enum(adminRoles)).min(1));

type CloudflareAccessProviderOptions = {
  fetch?: FetchImplementation;
  cooldownDuration?: number;
  cacheMaxAge?: number;
};

function configurationError(message: string): never {
  throw new AdminAuthenticationError('authentication_unavailable', message);
}

function normalizeTeamDomain(value: string | undefined): URL {
  if (!value) configurationError('Cloudflare Access team domain is not configured.');
  let url: URL;
  try {
    url = new URL(value.includes('://') ? value : `https://${value}`);
  } catch {
    return configurationError('Cloudflare Access team domain is invalid.');
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.port ||
    url.pathname !== '/' ||
    url.search ||
    url.hash ||
    !url.hostname.endsWith('.cloudflareaccess.com')
  ) {
    configurationError('Cloudflare Access team domain is invalid.');
  }
  return url;
}

function parseAllowedEmails(value: string | undefined): Set<string> {
  const emails = (value ?? '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  const parsed = z.array(z.string().email()).min(1).safeParse(emails);
  if (!parsed.success) configurationError('The administrator allowlist is not configured.');
  return new Set(parsed.data);
}

function parseRoleMappings(value: string | undefined): ReadonlyMap<string, AdminRole[]> {
  if (!value) configurationError('Administrator role mappings are not configured.');
  let untrusted: unknown;
  try {
    untrusted = JSON.parse(value);
  } catch {
    return configurationError('Administrator role mappings are invalid.');
  }
  const parsed = roleMappingSchema.safeParse(untrusted);
  if (!parsed.success) configurationError('Administrator role mappings are invalid.');
  return new Map(
    Object.entries(parsed.data).map(([email, roles]) => [email.toLowerCase(), roles] as const),
  );
}

function accessToken(request: Request): string {
  const token = request.headers.get('Cf-Access-Jwt-Assertion')?.trim();
  if (!token) {
    throw new AdminAuthenticationError(
      'authentication_required',
      'A valid Cloudflare Access session is required.',
    );
  }
  return token;
}

export class CloudflareAccessAuthenticationProvider {
  private readonly keySets = new Map<string, JWTVerifyGetKey>();

  constructor(private readonly options: CloudflareAccessProviderOptions = {}) {}

  private keySet(url: URL): JWTVerifyGetKey {
    const cacheKey = url.href;
    const cached = this.keySets.get(cacheKey);
    if (cached) return cached;
    const keySet = createRemoteJWKSet(url, {
      timeoutDuration: 5_000,
      cooldownDuration: this.options.cooldownDuration ?? 30_000,
      cacheMaxAge: this.options.cacheMaxAge ?? 10 * 60_000,
      ...(this.options.fetch ? { [customFetch]: this.options.fetch } : {}),
    });
    this.keySets.set(cacheKey, keySet);
    return keySet;
  }

  async authenticate(request: Request, bindings: AdminRuntimeBindings): Promise<AdminIdentity> {
    const teamDomain = normalizeTeamDomain(bindings.CLOUDFLARE_ACCESS_TEAM_DOMAIN);
    const audience = bindings.CLOUDFLARE_ACCESS_AUD?.trim();
    if (!audience) configurationError('Cloudflare Access audience is not configured.');
    const allowedEmails = parseAllowedEmails(bindings.ADMIN_ALLOWED_EMAILS);
    const roleMappings = parseRoleMappings(bindings.ADMIN_ROLE_MAPPINGS);
    const token = accessToken(request);

    let payload: Awaited<ReturnType<typeof jwtVerify>>['payload'];
    try {
      ({ payload } = await jwtVerify(
        token,
        this.keySet(new URL('/cdn-cgi/access/certs', teamDomain)),
        {
          algorithms: ['RS256'],
          issuer: teamDomain.href.replace(/\/$/u, ''),
          audience,
        },
      ));
    } catch {
      throw new AdminAuthenticationError(
        'authentication_required',
        'The Cloudflare Access session is invalid or expired.',
      );
    }

    const claims = accessClaimsSchema.safeParse(payload);
    if (!claims.success) {
      throw new AdminAuthenticationError(
        'authentication_required',
        'The Cloudflare Access identity is incomplete.',
      );
    }
    const email = claims.data.email.toLowerCase();
    if (!allowedEmails.has(email)) {
      throw new AdminAuthenticationError(
        'authentication_required',
        'This Cloudflare Access identity is not an approved administrator.',
      );
    }
    const roles = roleMappings.get(email);
    if (!roles) configurationError('The approved administrator has no server-side role mapping.');

    return {
      subject: claims.data.sub,
      email,
      displayName: claims.data.name ?? email.split('@')[0] ?? 'Administrator',
      roles,
      permissions: permissionsForRoles(roles),
      authenticationSource: 'cloudflare_access',
    };
  }
}

export function isCloudflareAccessAuthenticationReady(bindings: AdminRuntimeBindings): boolean {
  try {
    normalizeTeamDomain(bindings.CLOUDFLARE_ACCESS_TEAM_DOMAIN);
    if (!bindings.CLOUDFLARE_ACCESS_AUD?.trim()) return false;
    parseAllowedEmails(bindings.ADMIN_ALLOWED_EMAILS);
    parseRoleMappings(bindings.ADMIN_ROLE_MAPPINGS);
    return bindings.AUTH_PROVIDER === 'cloudflare_access';
  } catch {
    return false;
  }
}
