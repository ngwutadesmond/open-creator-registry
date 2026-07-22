import { createMiddleware } from 'hono/factory';

import type { CloudflareRateLimitBinding, PublicAppEnv, PublicRuntimeBindings } from './app-env';
import { errorEnvelope } from './responses';

export type RateLimitContext = {
  method: string;
  pathname: string;
  request: Request;
};

export type RateLimitDecision =
  { allowed: true } | { allowed: false; retryAfterSeconds?: number; unavailable?: boolean };

export type PublicRateLimiter = {
  check(context: RateLimitContext): Promise<RateLimitDecision>;
};

export const disabledPublicRateLimiter: PublicRateLimiter = {
  check: () => Promise.resolve({ allowed: true }),
};

function distributedLimiterForRequest(
  bindings: PublicRuntimeBindings,
  method: string,
  pathname: string,
): CloudflareRateLimitBinding | undefined {
  if (method === 'GET' && pathname === '/api/v1/handles/check') {
    return bindings.PUBLIC_HANDLE_CHECK_RATE_LIMITER;
  }
  if (method === 'POST' && pathname === '/api/v1/handles/check-batch') {
    return bindings.PUBLIC_BATCH_CHECK_RATE_LIMITER;
  }
  if (method === 'POST' && pathname === '/api/v1/submissions') {
    return bindings.PUBLIC_SUBMISSION_RATE_LIMITER;
  }
  return undefined;
}

function createDistributedPublicRateLimiter(bindings: PublicRuntimeBindings): PublicRateLimiter {
  return {
    async check(context) {
      const binding = distributedLimiterForRequest(bindings, context.method, context.pathname);
      if (!binding) {
        return bindings.ENVIRONMENT === 'local' ||
          ![
            'GET:/api/v1/handles/check',
            'POST:/api/v1/handles/check-batch',
            'POST:/api/v1/submissions',
          ].includes(`${context.method}:${context.pathname}`)
          ? { allowed: true }
          : { allowed: false, unavailable: true };
      }
      const sourceAddress = context.request.headers.get('CF-Connecting-IP')?.trim() || 'unknown';
      try {
        const result = await binding.limit({ key: `${context.pathname}:${sourceAddress}` });
        return result.success ? { allowed: true } : { allowed: false, retryAfterSeconds: 60 };
      } catch {
        return { allowed: false, unavailable: true };
      }
    },
  };
}

export function createRateLimitMiddleware(rateLimiter?: PublicRateLimiter) {
  return createMiddleware<PublicAppEnv>(async (context, next) => {
    const decision = await (rateLimiter ?? createDistributedPublicRateLimiter(context.env)).check({
      method: context.req.method,
      pathname: new URL(context.req.url).pathname,
      request: context.req.raw,
    });
    if (!decision.allowed) {
      if (decision.unavailable) {
        return context.json(
          errorEnvelope(
            context,
            'rate_limit_unavailable',
            'The request cannot be safely processed because abuse protection is unavailable.',
          ),
          503,
        );
      }
      if (decision.retryAfterSeconds !== undefined) {
        context.header('Retry-After', String(decision.retryAfterSeconds));
      }
      return context.json(
        errorEnvelope(
          context,
          'rate_limited',
          'The request rate limit has been exceeded. Try again later.',
        ),
        429,
      );
    }
    await next();
  });
}
