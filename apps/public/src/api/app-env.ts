export type PublicRuntimeBindings = {
  DB: D1Database;
  ENVIRONMENT: string;
  ALLOWED_ORIGINS: string;
};

export type PublicAppEnv = {
  Bindings: PublicRuntimeBindings;
  Variables: {
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
