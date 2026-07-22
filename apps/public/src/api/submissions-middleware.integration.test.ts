import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createCreatorRepository } from '@open-creator-registry/database/repositories/creator-repository';
import { createPublicSubmissionRepository } from '@open-creator-registry/database/repositories/public-submission-repository';
import { createReservedHandleRepository } from '@open-creator-registry/database/repositories/reserved-handle-repository';

import { createPublicApp } from './routes';
import { healthResponseSchema, publicSubmissionResponseSchema } from './schemas';
import {
  deterministicRequestMetadata,
  createTestPublicApp,
  requestApi,
  resetAndSeedApiDatabase,
  testBindings,
} from './test-utils';

beforeEach(resetAndSeedApiDatabase);

const validSubmission = {
  creator_name: 'Demo Submission Person',
  category: 'music',
  country_codes: ['ng'],
  requested_handles: ['@demo.submission.person'],
  public_sources: ['https://example.test/public-profile'],
};

describe('public submissions', () => {
  it('creates only a pending review record and does not mutate the live registry', async () => {
    const creatorsBefore = await createCreatorRepository(env.DB).count();
    const handlesBefore = await createReservedHandleRepository(env.DB).count();
    const response = await requestApi('/api/v1/submissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validSubmission),
    });
    const body = publicSubmissionResponseSchema.parse(await response.json());
    expect(response.status).toBe(201);
    expect(body.data).toMatchObject({
      submission_status: 'pending',
      message: 'The submission was received for human review. No handle was reserved.',
    });
    expect(Object.keys(body.data).sort()).toEqual([
      'created_at',
      'id',
      'message',
      'submission_status',
    ]);
    expect(await createCreatorRepository(env.DB).count()).toBe(creatorsBefore);
    expect(await createReservedHandleRepository(env.DB).count()).toBe(handlesBefore);
    expect(
      (await createPublicSubmissionRepository(env.DB).findById(body.data.id))?.countryCodes,
    ).toEqual(['NG']);
  });

  it('returns 409 for an equivalent pending submission regardless of list order', async () => {
    const initial = {
      ...validSubmission,
      requested_handles: ['demo_one', 'demo_two'],
      public_sources: ['https://example.test/one', 'https://example.test/two'],
    };
    expect(
      (
        await requestApi('/api/v1/submissions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(initial),
        })
      ).status,
    ).toBe(201);
    const duplicate = await requestApi('/api/v1/submissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...initial,
        creator_name: '  demo submission person ',
        requested_handles: ['@demo.two', 'demo-one'],
        public_sources: ['https://example.test/two', 'https://example.test/one'],
      }),
    });
    expect(duplicate.status).toBe(409);
    await expect(duplicate.json()).resolves.toMatchObject({ error: { code: 'conflict' } });
  });

  it('rejects invalid fields, limits, malformed JSON, unsupported media, and oversized bodies', async () => {
    const invalidBodies = [
      { ...validSubmission, creator_name: 'x' },
      { ...validSubmission, requested_handles: ['%bad'] },
      {
        ...validSubmission,
        requested_handles: Array.from({ length: 11 }, (_, index) => `name_${index}`),
      },
      { ...validSubmission, public_sources: ['not-a-url'] },
      {
        ...validSubmission,
        public_sources: Array.from({ length: 11 }, (_, index) => `https://example.test/${index}`),
      },
    ];
    for (const body of invalidBodies) {
      const response = await requestApi('/api/v1/submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      expect(response.status).toBe(422);
    }

    const malformed = await requestApi('/api/v1/submissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{invalid',
    });
    expect(malformed.status).toBe(400);

    const unsupported = await requestApi('/api/v1/submissions', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(validSubmission),
    });
    expect(unsupported.status).toBe(415);

    const oversized = await requestApi('/api/v1/submissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...validSubmission, ignored_padding: 'x'.repeat(40_000) }),
    });
    expect(oversized.status).toBe(413);
  });

  it('maps submission database failures to safe responses', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await env.DB.prepare(
      `CREATE TRIGGER reject_public_submission_test
       BEFORE INSERT ON public_submissions
       BEGIN
         SELECT RAISE(ABORT, 'private SQL failure');
       END`,
    ).run();
    try {
      const response = await createPublicApp({ metadata: deterministicRequestMetadata }).request(
        '/api/v1/submissions',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(validSubmission),
        },
        testBindings,
      );
      const text = await response.text();
      expect(response.status).toBe(503);
      expect(text).not.toContain('private SQL failure');
      expect(
        consoleError.mock.calls.some(([message]) => String(message).includes('public_api_error')),
      ).toBe(true);
    } finally {
      await env.DB.prepare('DROP TRIGGER reject_public_submission_test').run();
    }
  });
});

describe('public API middleware and health', () => {
  it('returns health, deterministic metadata, request IDs, and security headers', async () => {
    const response = await requestApi('/api/v1/health', {
      headers: { 'X-Request-ID': '90000000-0000-4000-8000-000000000999' },
    });
    const body = healthResponseSchema.parse(await response.json());
    expect(response.status).toBe(200);
    expect(body.data).toMatchObject({
      service: 'Open Creator Registry API',
      status: 'ok',
      environment: 'local',
      database: { status: 'connected' },
      migrations: { status: 'compatible' },
    });
    expect(body.meta.request_id).toBe('90000000-0000-4000-8000-000000000999');
    expect(response.headers.get('X-Request-ID')).toBe('90000000-0000-4000-8000-000000000999');
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(response.headers.get('X-Frame-Options')).toBe('DENY');
    expect(response.headers.get('Content-Security-Policy')).not.toContain('unsafe-eval');
    expect(response.headers.get('Cross-Origin-Opener-Policy')).toBe('same-origin');
    expect(response.headers.get('Strict-Transport-Security')).toBeNull();
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('preserves route cache policies and assigns safe defaults only when absent', async () => {
    const routeSpecific = await requestApi('/api/v1/handles/check?handle=ordinary_name');
    expect(routeSpecific.status).toBe(200);
    expect(routeSpecific.headers.get('Cache-Control')).toBe(
      'public, max-age=0, s-maxage=60, must-revalidate',
    );

    const documentation = await requestApi('/docs');
    expect(documentation.status).toBe(200);
    expect(documentation.headers.get('Cache-Control')).toBe('no-cache');

    const openApi = await requestApi('/openapi.json');
    expect(openApi.status).toBe(200);
    expect(openApi.headers.get('Cache-Control')).toBe('no-cache');
  });

  it('self-hosts documentation assets under a CSP without remote script sources', async () => {
    const response = await requestApi('/docs');
    const html = await response.text();
    const policy = response.headers.get('Content-Security-Policy') ?? '';
    expect(response.status).toBe(200);
    expect(html).toContain('/vendor/scalar/standalone.js');
    expect(html).toContain('withDefaultFonts');
    expect(html).not.toContain('cdn.jsdelivr.net');
    expect(policy).not.toContain('cdn.jsdelivr.net');
    expect(policy).not.toContain('fonts.scalar.com');
    expect(policy).toContain("style-src 'self' 'unsafe-inline'");
    expect(policy).toContain("script-src 'self' 'nonce-00112233445566778899aabbccddeeff'");
  });

  it('allows the local Vite preamble without weakening remote SPA script policy', async () => {
    const local = await createTestPublicApp().request('/', undefined, testBindings);
    expect(local.headers.get('Content-Security-Policy')).toContain(
      "script-src 'self' 'unsafe-inline'",
    );

    const production = await createTestPublicApp().request('/', undefined, {
      ...testBindings,
      ENVIRONMENT: 'production',
    });
    const policy = production.headers.get('Content-Security-Policy') ?? '';
    expect(policy).toContain("script-src 'self'");
    expect(policy).not.toContain("script-src 'self' 'unsafe-inline'");
  });

  it('uses distributed bindings for protected production routes and fails safely without them', async () => {
    const binding = { limit: vi.fn(() => Promise.resolve({ success: false })) };
    const productionBindings = {
      ...testBindings,
      ENVIRONMENT: 'production',
      PUBLIC_HANDLE_CHECK_RATE_LIMITER: binding,
    };
    const limited = await createTestPublicApp().request(
      '/api/v1/handles/check?handle=ordinary_name',
      { headers: { 'CF-Connecting-IP': '192.0.2.4' } },
      productionBindings,
    );
    expect(limited.status).toBe(429);
    expect(binding.limit).toHaveBeenCalledWith({
      key: '/api/v1/handles/check:192.0.2.4',
    });

    const unavailable = await createTestPublicApp().request(
      '/api/v1/handles/check?handle=ordinary_name',
      undefined,
      { ...testBindings, ENVIRONMENT: 'production' },
    );
    expect(unavailable.status).toBe(503);
    await expect(unavailable.json()).resolves.toMatchObject({
      error: { code: 'rate_limit_unavailable' },
    });
  });

  it('uses generated IDs when inbound IDs are invalid', async () => {
    const response = await requestApi('/api/v1/health', {
      headers: { 'X-Request-ID': 'bad id' },
    });
    expect(response.headers.get('X-Request-ID')).toBe('90000000-0000-4000-8000-000000000001');
  });

  it('allows configured CORS origins and rejects unapproved origins', async () => {
    const allowed = await requestApi('/api/v1/health', {
      headers: { Origin: 'http://localhost:5173' },
    });
    expect(allowed.status).toBe(200);
    expect(allowed.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:5173');
    expect(allowed.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(allowed.headers.get('Content-Security-Policy')).toContain("default-src 'none'");

    const preflight = await requestApi('/api/v1/submissions', {
      method: 'OPTIONS',
      headers: { Origin: 'http://localhost:5173' },
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('Cache-Control')).toBe('no-store');
    expect(preflight.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:5173');
    expect(preflight.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(preflight.headers.get('Content-Security-Policy')).toContain("default-src 'none'");

    const rejected = await requestApi('/api/v1/health', {
      headers: { Origin: 'https://unapproved.example' },
    });
    expect(rejected.status).toBe(403);
    expect(rejected.headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect(rejected.headers.get('Cache-Control')).toBe('no-cache');
    expect(rejected.headers.get('X-Frame-Options')).toBe('DENY');
  });

  it('returns stable method, route, and injected rate-limit errors', async () => {
    const method = await requestApi('/api/v1/health', { method: 'POST' });
    expect(method.status).toBe(405);
    expect(method.headers.get('Allow')).toBe('GET');
    expect(method.headers.get('Cache-Control')).toBe('no-store');
    expect(method.headers.get('X-Frame-Options')).toBe('DENY');

    const missing = await requestApi('/api/v1/not-a-route');
    expect(missing.status).toBe(404);
    expect(missing.headers.get('Cache-Control')).toBe('no-cache');
    expect(missing.headers.get('X-Content-Type-Options')).toBe('nosniff');

    const limitedApp = createPublicApp({
      metadata: deterministicRequestMetadata,
      rateLimiter: {
        check: () => Promise.resolve({ allowed: false, retryAfterSeconds: 30 }),
      },
    });
    const limited = await limitedApp.request('/api/v1/health', undefined, testBindings);
    expect(limited.status).toBe(429);
    expect(limited.headers.get('Retry-After')).toBe('30');
  });

  it('returns a truthful 503 health document when D1 is unavailable', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await env.DB.prepare(
      'ALTER TABLE registry_releases RENAME TO registry_releases_temporarily_unavailable',
    ).run();
    try {
      const response = await createPublicApp({ metadata: deterministicRequestMetadata }).request(
        '/api/v1/health',
        undefined,
        testBindings,
      );
      const body = healthResponseSchema.parse(await response.json());
      expect(response.status).toBe(503);
      expect(body.data).toMatchObject({
        status: 'unavailable',
        database: { status: 'unavailable' },
        registry_version: null,
      });
      expect(
        consoleError.mock.calls.some(([message]) =>
          String(message).includes('public_api_health_failure'),
        ),
      ).toBe(true);
    } finally {
      await env.DB.prepare(
        'ALTER TABLE registry_releases_temporarily_unavailable RENAME TO registry_releases',
      ).run();
    }
  });
});
