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
};

export type AdminRuntimeBindings = Omit<
  AdminBindings,
  'ENVIRONMENT' | 'AUTH_PROVIDER' | 'ADMIN_ALLOWED_ORIGINS'
> &
  AdminAuthenticationBindings;

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
