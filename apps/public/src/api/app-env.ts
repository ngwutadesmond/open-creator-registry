export type PublicRuntimeBindings = {
  DB: D1Database;
  ENVIRONMENT: string;
  ALLOWED_ORIGINS: string;
  APPLICATION_URL?: string;
  API_DOCUMENTATION_SERVER?: string;
  WORKER_NAME?: string;
  ASSETS?: Fetcher;
  PUBLIC_HANDLE_CHECK_RATE_LIMITER?: CloudflareRateLimitBinding;
  PUBLIC_BATCH_CHECK_RATE_LIMITER?: CloudflareRateLimitBinding;
  PUBLIC_SUBMISSION_RATE_LIMITER?: CloudflareRateLimitBinding;
};

export type CloudflareRateLimitBinding = {
  limit(input: { key: string }): Promise<{ success: boolean }>;
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
