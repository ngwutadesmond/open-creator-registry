import { createMiddleware } from 'hono/factory';

import type { AdminAppEnv, RequestMetadataProvider } from './app-env';
import { errorEnvelope } from './responses';

const validRequestId =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export function createRequestContextMiddleware(metadata: RequestMetadataProvider) {
  return createMiddleware<AdminAppEnv>(async (context, next) => {
    const inbound = context.req.header('X-Request-ID');
    const requestId =
      inbound && validRequestId.test(inbound) ? inbound : metadata.createRequestId();
    context.set('requestId', requestId);
    context.set('requestTimestamp', metadata.now());
    context.set('cspNonce', metadata.createCspNonce());
    await next();
    context.header('X-Request-ID', requestId);
  });
}

export const adminSecurityHeadersMiddleware = createMiddleware<AdminAppEnv>(
  async (context, next) => {
    await next();
    const isDocs = new URL(context.req.url).pathname === '/admin-docs';
    context.header('Cache-Control', 'no-store');
    context.header('X-Content-Type-Options', 'nosniff');
    context.header('X-Frame-Options', 'DENY');
    context.header('Referrer-Policy', 'no-referrer');
    context.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    context.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    context.header(
      'Content-Security-Policy',
      isDocs
        ? `default-src 'none'; script-src 'self' 'nonce-${context.get('cspNonce')}' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; connect-src 'self'; img-src 'self' data:; font-src https://fonts.scalar.com data:; frame-ancestors 'none'; base-uri 'none'; form-action 'none'`
        : "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
    );
  },
);

export const adminCorsMiddleware = createMiddleware<AdminAppEnv>(async (context, next) => {
  const origin = context.req.header('Origin');
  if (!origin) {
    await next();
    return;
  }
  const allowed = new Set(
    context.env.ADMIN_ALLOWED_ORIGINS.split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  );
  if (!allowed.has(origin)) {
    return context.json(
      errorEnvelope(
        context,
        'authorization_denied',
        'This origin is not permitted to call the administration API.',
      ),
      403,
    );
  }
  context.header('Access-Control-Allow-Origin', origin);
  context.header('Vary', 'Origin');
  context.header('Access-Control-Allow-Credentials', 'true');
  context.header('Access-Control-Expose-Headers', 'X-Request-ID');
  if (context.req.method === 'OPTIONS') {
    context.header('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    context.header('Access-Control-Allow-Headers', 'Content-Type, X-Request-ID');
    context.header('Access-Control-Max-Age', '600');
    return context.body(null, 204);
  }
  await next();
});
