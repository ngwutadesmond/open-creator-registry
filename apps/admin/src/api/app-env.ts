import type { AdminIdentity } from '@open-creator-registry/contracts/admin';

export type AdminAuthenticationBindings = {
  ENVIRONMENT: string;
  AUTH_PROVIDER: string;
  ADMIN_ALLOWED_ORIGINS: string;
  DEV_ADMIN_ACTIVE?: string;
  DEV_ADMIN_EMAIL?: string;
  DEV_ADMIN_NAME?: string;
  DEV_ADMIN_ROLES?: string;
  DEV_ADMIN_SECONDARY_EMAIL?: string;
  DEV_ADMIN_SECONDARY_NAME?: string;
  DEV_ADMIN_SECONDARY_ROLES?: string;
  WIKIDATA_FIXTURE_MODE?: string;
  WIKIDATA_USER_AGENT?: string;
  CLOUDFLARE_ACCESS_TEAM_DOMAIN?: string;
  CLOUDFLARE_ACCESS_AUD?: string;
  ADMIN_ALLOWED_EMAILS?: string;
  ADMIN_ROLE_MAPPINGS?: string;
  APPLICATION_URL?: string;
  API_DOCUMENTATION_SERVER?: string;
  WORKER_NAME?: string;
  ASSETS?: Fetcher;
  ADMIN_AUTH_FAILURE_RATE_LIMITER?: CloudflareRateLimitBinding;
  ADMIN_MUTATION_RATE_LIMITER?: CloudflareRateLimitBinding;
  ADMIN_INGESTION_RATE_LIMITER?: CloudflareRateLimitBinding;
};

export type CloudflareRateLimitBinding = {
  limit(input: { key: string }): Promise<{ success: boolean }>;
};

export type AdminRuntimeBindings = Pick<AdminBindings, 'DB'> & AdminAuthenticationBindings;

export type AdminAppEnv = {
  Bindings: AdminRuntimeBindings;
  Variables: {
    adminIdentity: AdminIdentity;
    cspNonce: string;
    requestId: string;
    requestTimestamp: string;
  };
};

export type RequestMetadataProvider = {
  createCspNonce(): string;
  createRequestId(): string;
  now(): string;
};

export const defaultRequestMetadataProvider: RequestMetadataProvider = {
  createCspNonce: () => crypto.randomUUID().replaceAll('-', ''),
  createRequestId: () => crypto.randomUUID(),
  now: () => new Date().toISOString(),
};
