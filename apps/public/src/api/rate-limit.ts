import { createMiddleware } from 'hono/factory';

import type { PublicAppEnv } from './app-env';
import { errorEnvelope } from './responses';

export type RateLimitContext = {
  method: string;
  pathname: string;
  request: Request;
};

export type RateLimitDecision = { allowed: true } | { allowed: false; retryAfterSeconds?: number };

export type PublicRateLimiter = {
  check(context: RateLimitContext): Promise<RateLimitDecision>;
};

export const disabledPublicRateLimiter: PublicRateLimiter = {
  check: () => Promise.resolve({ allowed: true }),
};

export function createRateLimitMiddleware(rateLimiter: PublicRateLimiter) {
  return createMiddleware<PublicAppEnv>(async (context, next) => {
    const decision = await rateLimiter.check({
      method: context.req.method,
      pathname: new URL(context.req.url).pathname,
      request: context.req.raw,
    });
    if (!decision.allowed) {
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
