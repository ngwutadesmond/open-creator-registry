import { createMiddleware } from 'hono/factory';

import type { PublicAppEnv, RequestMetadataProvider } from './app-env';
import { errorEnvelope } from './responses';

const validRequestId =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export function createRequestContextMiddleware(metadata: RequestMetadataProvider) {
  return createMiddleware<PublicAppEnv>(async (context, next) => {
    const inboundRequestId = context.req.header('X-Request-ID');
    const requestId =
      inboundRequestId && validRequestId.test(inboundRequestId)
        ? inboundRequestId
        : metadata.createRequestId();
    context.set('requestId', requestId);
    context.set('requestTimestamp', metadata.now());
    context.set('cspNonce', metadata.createCspNonce());
    await next();
    context.header('X-Request-ID', requestId);
  });
}

export const securityHeadersMiddleware = createMiddleware<PublicAppEnv>(async (context, next) => {
  await next();
  const isDocumentation = new URL(context.req.url).pathname === '/docs';
  if (context.req.method !== 'GET' && context.req.method !== 'HEAD') {
    context.header('Cache-Control', 'no-store');
  }
  context.header('X-Content-Type-Options', 'nosniff');
  context.header('X-Frame-Options', 'DENY');
  context.header('Referrer-Policy', 'no-referrer');
  context.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  context.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  context.header(
    'Content-Security-Policy',
    isDocumentation
      ? `default-src 'none'; script-src 'self' 'nonce-${context.get('cspNonce')}' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; connect-src 'self'; img-src 'self' data:; font-src https://fonts.scalar.com data:; frame-ancestors 'none'; base-uri 'none'; form-action 'none'`
      : "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  );
});

export const corsMiddleware = createMiddleware<PublicAppEnv>(async (context, next) => {
  const origin = context.req.header('Origin');
  if (!origin) {
    await next();
    return;
  }

  const allowedOrigins = new Set(
    context.env.ALLOWED_ORIGINS.split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  );
  if (!allowedOrigins.has(origin)) {
    return context.json(
      errorEnvelope(
        context,
        'cors_origin_forbidden',
        'This origin is not permitted to call the public API.',
      ),
      403,
    );
  }

  context.header('Access-Control-Allow-Origin', origin);
  context.header('Vary', 'Origin');
  context.header('Access-Control-Expose-Headers', 'X-Request-ID');
  if (context.req.method === 'OPTIONS') {
    context.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    context.header('Access-Control-Allow-Headers', 'Content-Type, X-Request-ID');
    context.header('Access-Control-Max-Age', '600');
    return context.body(null, 204);
  }
  await next();
});

export const jsonContentTypeMiddleware = createMiddleware<PublicAppEnv>(async (context, next) => {
  const contentType = context.req.header('Content-Type') ?? '';
  if (!/^application\/json(?:\s*;|$)/iu.test(contentType)) {
    return context.json(
      errorEnvelope(
        context,
        'unsupported_media_type',
        'This endpoint requires an application/json request body.',
      ),
      415,
    );
  }
  await next();
});
