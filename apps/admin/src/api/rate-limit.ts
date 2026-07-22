import type { Context } from 'hono';
import { createMiddleware } from 'hono/factory';

import type { AdminAppEnv, CloudflareRateLimitBinding } from './app-env';
import { errorEnvelope } from './responses';

async function limit(
  context: Context<AdminAppEnv>,
  binding: CloudflareRateLimitBinding | undefined,
  key: string,
): Promise<Response | null> {
  if (!binding) {
    return context.env.ENVIRONMENT === 'local'
      ? null
      : context.json(
          errorEnvelope(
            context,
            'rate_limit_unavailable',
            'The request cannot be safely processed because abuse protection is unavailable.',
          ),
          503,
        );
  }
  try {
    if ((await binding.limit({ key })).success) return null;
    context.header('Retry-After', '60');
    return context.json(
      errorEnvelope(
        context,
        'rate_limited',
        'The request rate limit has been exceeded. Try again later.',
      ),
      429,
    );
  } catch {
    return context.json(
      errorEnvelope(
        context,
        'rate_limit_unavailable',
        'The request cannot be safely processed because abuse protection is unavailable.',
      ),
      503,
    );
  }
}

export async function enforceAuthenticationFailureLimit(
  context: Context<AdminAppEnv>,
): Promise<Response | null> {
  if (!context.env.ADMIN_AUTH_FAILURE_RATE_LIMITER) return null;
  const sourceAddress = context.req.header('CF-Connecting-IP')?.trim() || 'unknown';
  return limit(
    context,
    context.env.ADMIN_AUTH_FAILURE_RATE_LIMITER,
    `authentication:${sourceAddress}`,
  );
}

export const adminMutationRateLimitMiddleware = createMiddleware<AdminAppEnv>(
  async (context, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(context.req.method)) {
      await next();
      return;
    }
    const pathname = new URL(context.req.url).pathname;
    const ingestion = /^\/api\/admin\/v1\/ingestion-runs\/(?:preview|start)$/u.test(pathname);
    const binding = ingestion
      ? context.env.ADMIN_INGESTION_RATE_LIMITER
      : context.env.ADMIN_MUTATION_RATE_LIMITER;
    const response = await limit(
      context,
      binding,
      `${ingestion ? 'ingestion' : 'mutation'}:${context.get('adminIdentity').subject}`,
    );
    if (response) return response;
    await next();
  },
);
