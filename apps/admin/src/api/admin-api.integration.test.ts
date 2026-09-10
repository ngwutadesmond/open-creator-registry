import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createAuditLogRepository } from '@open-creator-registry/database/repositories/audit-log-repository';
import { createAdminApprovalRepository } from '@open-creator-registry/database/repositories/admin-approval-repository';
import { createCreatorCandidateRepository } from '@open-creator-registry/database/repositories/creator-candidate-repository';
import { createPublicSubmissionRepository } from '@open-creator-registry/database/repositories/public-submission-repository';
import { createReservedHandleRepository } from '@open-creator-registry/database/repositories/reserved-handle-repository';
import { createExternalProfileRepository } from '@open-creator-registry/database/repositories/external-profile-repository';
import { seedDatabase } from '@open-creator-registry/database/seed';
import { clearDatabase } from '../../../../packages/database/src/test/test-utils';
import { createPublicApp } from '../../../public/src/api/routes';
import type { PublicRuntimeBindings } from '../../../public/src/api/app-env';
import type { AdminRuntimeBindings, RequestMetadataProvider } from './app-env';
import { createAdminApp } from './routes';

const metadata: RequestMetadataProvider = {
  createCspNonce: () => '00112233445566778899aabbccddeeff',
  createRequestId: () => '90000000-0000-4000-8000-000000000001',
  now: () => '2026-07-21T18:00:00.000Z',
};

const superAdminBindings: AdminRuntimeBindings = {
  DB: env.DB,
  ENVIRONMENT: 'local',
  AUTH_PROVIDER: 'local_development',
  ADMIN_ALLOWED_ORIGINS: 'http://localhost:5174',
  DEV_ADMIN_ACTIVE: 'primary',
  DEV_ADMIN_EMAIL: 'admin-one@example.test',
  DEV_ADMIN_NAME: 'Admin One',
  DEV_ADMIN_ROLES: 'super_admin,publisher,editor,reviewer,admin_viewer',
  DEV_ADMIN_SECONDARY_EMAIL: 'admin-two@example.test',
  DEV_ADMIN_SECONDARY_NAME: 'Admin Two',
  DEV_ADMIN_SECONDARY_ROLES: 'super_admin,publisher,editor,reviewer,admin_viewer',
  WIKIDATA_FIXTURE_MODE: 'enabled',
};

const viewerBindings: AdminRuntimeBindings = {
  ...superAdminBindings,
  DEV_ADMIN_EMAIL: 'viewer@example.test',
  DEV_ADMIN_NAME: 'Registry Viewer',
  DEV_ADMIN_ROLES: 'admin_viewer',
};

const app = createAdminApp({ metadata });

async function request(
  path: string,
  init?: RequestInit,
  bindings: AdminRuntimeBindings = superAdminBindings,
) {
  return app.request(path, init, bindings);
}

function jsonInit(body: unknown, cookie?: 'primary' | 'secondary'): RequestInit {
  return {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(cookie ? { Cookie: `ocr_dev_admin=${cookie}` } : {}),
    },
    body: JSON.stringify(body),
  };
}

async function responseData(response: Response): Promise<Record<string, unknown>> {
  const body: unknown = await response.json();
  if (
    typeof body !== 'object' ||
    body === null ||
    !('data' in body) ||
    typeof body.data !== 'object' ||
    body.data === null
  ) {
    throw new Error('Expected an administration data envelope.');
  }
  return body.data as Record<string, unknown>;
}

beforeEach(async () => {
  await clearDatabase();
  await seedDatabase(env.DB);
});

describe('administration authentication and authorization', () => {
  it('recognises a configured local administrator and ignores client identity headers', async () => {
    const response = await request('/api/admin/v1/me', {
      headers: {
        'X-Admin-Email': 'attacker@example.test',
        'X-Request-ID': '10000000-0000-4000-8000-000000000099',
      },
    });
    const data = await responseData(response);

    expect(response.status).toBe(200);
    expect(data.email).toBe('admin-one@example.test');
    expect(data.authentication_source).toBe('local_development');
    expect(response.headers.get('X-Request-ID')).toBe('10000000-0000-4000-8000-000000000099');
  });

  it('denies missing, invalid and production-like authentication configurations', async () => {
    const missing = await request('/api/admin/v1/me', undefined, {
      ...superAdminBindings,
      AUTH_PROVIDER: 'unconfigured',
    });
    const production = await request('/api/admin/v1/me', undefined, {
      ...superAdminBindings,
      ENVIRONMENT: 'production',
    });
    const invalidRoles = await request('/api/admin/v1/me', undefined, {
      ...superAdminBindings,
      DEV_ADMIN_ROLES: 'unknown_role',
    });

    expect(missing.status).toBe(401);
    expect(production.status).toBe(401);
    expect(invalidRoles.status).toBe(503);
  });

  it('allows viewer reads and denies viewer mutations on the server', async () => {
    expect((await request('/api/admin/v1/dashboard', undefined, viewerBindings)).status).toBe(200);
    const mutation = await request(
      '/api/admin/v1/creators',
      jsonInit({
        canonical_name: 'Denied Creator',
        entity_type: 'person',
        notoriety_score: 10,
        protection_tier: 'standard',
        review_status: 'pending',
      }),
      viewerBindings,
    );
    expect(mutation.status).toBe(403);
  });

  it('switches only between server-configured local slots', async () => {
    const switched = await request(
      '/api/admin/v1/development/identity',
      jsonInit({ slot: 'secondary' }),
    );
    const cookie = switched.headers.get('Set-Cookie');
    expect(switched.status).toBe(200);
    expect(cookie).toContain('ocr_dev_admin=secondary');

    const me = await request('/api/admin/v1/me', {
      headers: { Cookie: 'ocr_dev_admin=secondary' },
    });
    expect((await responseData(me)).email).toBe('admin-two@example.test');
    expect(
      (
        await request(
          '/api/admin/v1/development/identity',
          jsonInit({ slot: 'attacker@example.test' }),
        )
      ).status,
    ).toBe(422);
  });

  it('rate-limits authentication failures and authenticated mutations with distributed bindings', async () => {
    const authenticationLimiter = { limit: vi.fn(() => Promise.resolve({ success: false })) };
    const denied = await request('/api/admin/v1/me', undefined, {
      ...superAdminBindings,
      ENVIRONMENT: 'production',
      AUTH_PROVIDER: 'unconfigured',
      ADMIN_AUTH_FAILURE_RATE_LIMITER: authenticationLimiter,
    });
    expect(denied.status).toBe(429);
    expect(authenticationLimiter.limit).toHaveBeenCalled();

    const mutationLimiter = { limit: vi.fn(() => Promise.resolve({ success: false })) };
    const mutation = await request(
      '/api/admin/v1/creators',
      jsonInit({
        canonical_name: 'Rate Limited Creator',
        entity_type: 'person',
        notoriety_score: 20,
        protection_tier: 'standard',
        review_status: 'pending',
      }),
      { ...superAdminBindings, ADMIN_MUTATION_RATE_LIMITER: mutationLimiter },
    );
    expect(mutation.status).toBe(429);
    expect(mutationLimiter.limit).toHaveBeenCalledWith({
      key: 'mutation:local:admin-one@example.test',
    });
  });

  it('serves authenticated documentation from self-hosted assets under a private CSP', async () => {
    const response = await request('/admin-docs');
    const html = await response.text();
    const policy = response.headers.get('Content-Security-Policy') ?? '';
    expect(response.status).toBe(200);
    expect(html).toContain('/vendor/scalar/standalone.js');
    expect(html).toContain('withDefaultFonts');
    expect(html).not.toContain('cdn.jsdelivr.net');
    expect(policy).not.toContain('cdn.jsdelivr.net');
    expect(policy).toContain("style-src 'self' 'unsafe-inline'");
    expect(policy).toContain("script-src 'self' 'nonce-00112233445566778899aabbccddeeff'");
    expect(response.headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
    expect(response.headers.get('Strict-Transport-Security')).toBeNull();
  });

  it('keeps successful, error, documentation, and CORS administration responses private', async () => {
    const successful = await request('/api/admin/v1/me', {
      headers: { Origin: 'http://localhost:5174' },
    });
    expect(successful.status).toBe(200);
    expect(successful.headers.get('Cache-Control')).toBe('no-store');
    expect(successful.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:5174');
    expect(successful.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(successful.headers.get('X-Frame-Options')).toBe('DENY');
    expect(successful.headers.get('Content-Security-Policy')).toContain("default-src 'none'");

    const preflight = await request('/api/admin/v1/me', {
      method: 'OPTIONS',
      headers: { Origin: 'http://localhost:5174' },
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('Cache-Control')).toBe('no-store');
    expect(preflight.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:5174');
    expect(preflight.headers.get('X-Content-Type-Options')).toBe('nosniff');

    const rejectedOrigin = await request('/api/admin/v1/me', {
      headers: { Origin: 'https://unapproved.example' },
    });
    expect(rejectedOrigin.status).toBe(403);
    expect(rejectedOrigin.headers.get('Cache-Control')).toBe('no-store');
    expect(rejectedOrigin.headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect(rejectedOrigin.headers.get('Content-Security-Policy')).toContain("default-src 'none'");

    const missing = await request('/api/admin/v1/not-a-route');
    expect(missing.status).toBe(404);
    expect(missing.headers.get('Cache-Control')).toBe('no-store');
    expect(missing.headers.get('Cross-Origin-Opener-Policy')).toBe('same-origin');

    const publicApiPath = await request('/api/v1/health');
    expect(publicApiPath.status).toBe(404);
    expect(publicApiPath.headers.get('Cache-Control')).toBe('no-store');

    const documentation = await request('/admin-docs');
    expect(documentation.status).toBe(200);
    expect(documentation.headers.get('Cache-Control')).toBe('no-store');
  });

  it('allows local Vite bootstrap without weakening the remote administration SPA policy', async () => {
    const assets = {
      fetch: vi.fn(() => Promise.resolve(new Response('<!doctype html><title>Admin</title>'))),
    } as unknown as Fetcher;
    const local = await request('/', undefined, { ...superAdminBindings, ASSETS: assets });
    expect(local.headers.get('Content-Security-Policy')).toContain(
      "script-src 'self' 'unsafe-inline'",
    );

    const production = await request('/', undefined, {
      ...superAdminBindings,
      ENVIRONMENT: 'production',
      ASSETS: assets,
    });
    const policy = production.headers.get('Content-Security-Policy') ?? '';
    expect(policy).toContain("script-src 'self'");
    expect(policy).not.toContain("script-src 'self' 'unsafe-inline'");
  });
});

describe('creator, evidence and review administration', () => {
  it('creates, lists and updates creators with audit records', async () => {
    const create = await request(
      '/api/admin/v1/creators',
      jsonInit({
        canonical_name: 'Phase Five Creator',
        entity_type: 'person',
        primary_category: 'education',
        country_codes: ['NG'],
        biography_summary: 'A deterministic administration test creator.',
        notoriety_score: 64,
        protection_tier: 'notable',
        review_status: 'approved',
      }),
    );
    const created = await responseData(create);
    const id = String(created.id);

    expect(create.status).toBe(201);
    expect(
      (await request('/api/admin/v1/creators?query=Phase%20Five&category=education')).status,
    ).toBe(200);
    const update = await request(`/api/admin/v1/creators/${id}`, {
      ...jsonInit({ notoriety_score: 71 }),
      method: 'PATCH',
    });
    expect((await responseData(update)).notoriety_score).toBe(71);
    expect(
      (await createAuditLogRepository(env.DB).findByEntity('creator_entity', id)).map(
        (entry) => entry.action,
      ),
    ).toEqual(['creator.updated', 'creator.created']);
  });

  it('preserves omitted creator fields and evidence during a review-status-only update', async () => {
    const create = await request(
      '/api/admin/v1/creators',
      jsonInit({
        canonical_name: 'Fictional Patch Creator',
        entity_type: 'person',
        primary_category: 'education',
        country_codes: ['NG'],
        biography_summary: 'A fictional creator used to reproduce the PATCH regression.',
        notoriety_score: 40,
        protection_tier: 'notable',
        review_status: 'pending',
      }),
    );
    const created = await responseData(create);
    const creatorId = String(created.id);
    const source = await responseData(
      await request(
        `/api/admin/v1/creators/${creatorId}/sources`,
        jsonInit({
          source_name: 'fictional_source',
          source_entity_id: 'fictional-patch-creator',
          source_url: 'https://example.test/fictional-patch-creator',
          source_license: 'CC0-1.0',
          verification_status: 'verified',
          last_checked_at: '2026-07-21T17:00:00.000Z',
        }),
      ),
    );
    const alias = await responseData(
      await request(
        `/api/admin/v1/creators/${creatorId}/aliases`,
        jsonInit({
          alias: 'FictionalPatchCreator',
          language: 'en',
          alias_type: 'official_handle',
          confidence_score: 90,
          source_id: source.id,
        }),
      ),
    );
    const profile = await responseData(
      await request(
        `/api/admin/v1/creators/${creatorId}/profiles`,
        jsonInit({
          platform: 'x',
          platform_account_id: 'fictional-patch-account',
          platform_handle: 'FictionalPatchCreator',
          profile_url: 'https://x.com/FictionalPatchCreator',
          is_primary: true,
          verification_status: 'cross_source_confirmed',
          visibility_status: 'public',
          source_name: 'fictional_source',
          source_reference: 'fictional-patch-creator',
          confidence_score: 90,
          change_reason: 'Attach representative fictional profile evidence.',
        }),
      ),
    );

    const update = await request(`/api/admin/v1/creators/${creatorId}`, {
      ...jsonInit({ review_status: 'approved' }),
      method: 'PATCH',
    });
    expect(update.status).toBe(200);
    expect(await responseData(update)).toMatchObject({
      canonical_name: 'Fictional Patch Creator',
      entity_type: 'person',
      primary_category: 'education',
      country_codes: ['NG'],
      biography_summary: 'A fictional creator used to reproduce the PATCH regression.',
      notoriety_score: 40,
      protection_tier: 'notable',
      review_status: 'approved',
    });

    const detail = await responseData(await request(`/api/admin/v1/creators/${creatorId}`));
    expect(detail).toMatchObject({
      creator: { notoriety_score: 40, review_status: 'approved' },
      aliases: [expect.objectContaining({ id: alias.id })],
      sources: [expect.objectContaining({ id: source.id })],
      profiles: [expect.objectContaining({ id: profile.id, is_primary: true })],
    });
    const reviewAudit = (
      await createAuditLogRepository(env.DB).findByEntity('creator_entity', creatorId)
    )[0];
    expect(reviewAudit).toMatchObject({
      action: 'creator.updated',
      previousValue: { notorietyScore: 40, reviewStatus: 'pending' },
      newValue: { notorietyScore: 40, reviewStatus: 'approved' },
    });
    const previous = reviewAudit?.previousValue as Record<string, unknown>;
    const next = reviewAudit?.newValue as Record<string, unknown>;
    expect(
      Object.keys(next).filter(
        (key) => JSON.stringify(previous[key]) !== JSON.stringify(next[key]),
      ),
    ).toEqual(['reviewStatus', 'updatedAt']);

    const explicitZero = await request(`/api/admin/v1/creators/${creatorId}`, {
      ...jsonInit({ notoriety_score: 0, allow_common_name_duplicate: false }),
      method: 'PATCH',
    });
    expect(explicitZero.status).toBe(200);
    expect((await responseData(explicitZero)).notoriety_score).toBe(0);
    expect(
      (
        await request(`/api/admin/v1/creators/${creatorId}`, {
          ...jsonInit({}),
          method: 'PATCH',
        })
      ).status,
    ).toBe(422);
    expect(
      (
        await request(`/api/admin/v1/creators/${creatorId}`, {
          ...jsonInit({ review_status: 'approved', unexpected: true }),
          method: 'PATCH',
        })
      ).status,
    ).toBe(422);
  });

  it('blocks unacknowledged duplicate normalized creator names and invalid score ranges', async () => {
    const duplicate = await request(
      '/api/admin/v1/creators',
      jsonInit({
        canonical_name: 'Demo Aurora Vale',
        entity_type: 'person',
        notoriety_score: 50,
        protection_tier: 'standard',
        review_status: 'pending',
      }),
    );
    const invalid = await request(
      '/api/admin/v1/creators',
      jsonInit({
        canonical_name: 'Invalid Score',
        entity_type: 'person',
        notoriety_score: 101,
        protection_tier: 'standard',
        review_status: 'pending',
      }),
    );
    expect(duplicate.status).toBe(409);
    expect(invalid.status).toBe(422);
  });

  it('manages aliases and sources with duplicate, URL and audit safeguards', async () => {
    const creatorId = '10000000-0000-4000-8000-000000000001';
    const sourceResponse = await request(
      `/api/admin/v1/creators/${creatorId}/sources`,
      jsonInit({
        source_name: 'phase5_source',
        source_entity_id: 'phase5-1',
        source_url: 'https://example.test/phase5',
        source_license: 'CC0',
        verification_status: 'verified',
        last_checked_at: '2026-07-21T17:00:00.000Z',
      }),
    );
    const source = await responseData(sourceResponse);
    expect(sourceResponse.status).toBe(201);
    expect(
      (
        await request(
          `/api/admin/v1/creators/${creatorId}/sources`,
          jsonInit({
            source_name: 'bad',
            source_entity_id: 'bad',
            source_url: 'javascript:alert(1)',
            verification_status: 'pending',
          }),
        )
      ).status,
    ).toBe(422);

    const aliasResponse = await request(
      `/api/admin/v1/creators/${creatorId}/aliases`,
      jsonInit({
        alias: 'Phase Five Aurora',
        language: 'en',
        alias_type: 'known_alias',
        confidence_score: 80,
        source_id: source.id,
      }),
    );
    const alias = await responseData(aliasResponse);
    expect(aliasResponse.status).toBe(201);
    const punctuationAliasResponse = await request(
      `/api/admin/v1/creators/${creatorId}/aliases`,
      jsonInit({
        alias: 'Her First $100K',
        language: 'en',
        alias_type: 'known_alias',
        confidence_score: 100,
        source_id: source.id,
      }),
    );
    const punctuationAlias = await responseData(punctuationAliasResponse);
    expect(punctuationAliasResponse.status).toBe(201);
    expect(punctuationAlias).toMatchObject({
      alias: 'Her First $100K',
      normalized_alias: 'her_first_100k',
      alias_type: 'known_alias',
    });
    const auditCountBeforeInvalidAlias = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM audit_logs WHERE action = 'alias.created'",
    ).first<{ count: number }>();
    const invalidHandleAliasResponse = await request(
      `/api/admin/v1/creators/${creatorId}/aliases`,
      jsonInit({
        alias: 'Her First $100K',
        alias_type: 'official_handle',
        confidence_score: 100,
        source_id: source.id,
      }),
    );
    expect(invalidHandleAliasResponse.status).toBe(422);
    await expect(invalidHandleAliasResponse.json()).resolves.toMatchObject({
      error: { code: 'validation_failed' },
    });
    expect(
      await env.DB.prepare(
        "SELECT COUNT(*) AS count FROM audit_logs WHERE action = 'alias.created'",
      ).first<{ count: number }>(),
    ).toEqual(auditCountBeforeInvalidAlias);
    expect(
      (
        await request(
          `/api/admin/v1/creators/${creatorId}/aliases`,
          jsonInit({
            alias: 'phase-five-aurora',
            alias_type: 'known_alias',
            confidence_score: 80,
            source_id: source.id,
          }),
        )
      ).status,
    ).toBe(409);
    const sourceUpdate = await request(`/api/admin/v1/sources/${String(source.id)}`, {
      ...jsonInit({ source_license: null }),
      method: 'PATCH',
    });
    expect(await responseData(sourceUpdate)).toMatchObject({
      source_name: 'phase5_source',
      source_entity_id: 'phase5-1',
      source_url: 'https://example.test/phase5',
      source_license: null,
      verification_status: 'verified',
      last_checked_at: '2026-07-21T17:00:00.000Z',
    });
    const aliasUpdate = await request(`/api/admin/v1/aliases/${String(alias.id)}`, {
      ...jsonInit({ confidence_score: 90 }),
      method: 'PATCH',
    });
    expect(await responseData(aliasUpdate)).toMatchObject({
      alias: 'Phase Five Aurora',
      language: 'en',
      alias_type: 'known_alias',
      confidence_score: 90,
      source_id: source.id,
    });
    expect(
      (await createAuditLogRepository(env.DB).findByEntity('creator_source', String(source.id)))[0],
    ).toMatchObject({
      action: 'source.updated',
      previousValue: { sourceLicense: 'CC0', verificationStatus: 'verified' },
      newValue: { sourceLicense: null, verificationStatus: 'verified' },
    });
    expect(
      (await createAuditLogRepository(env.DB).findByEntity('creator_alias', String(alias.id)))[0],
    ).toMatchObject({
      action: 'alias.updated',
      previousValue: { alias: 'Phase Five Aurora', language: 'en', confidenceScore: 80 },
      newValue: { alias: 'Phase Five Aurora', language: 'en', confidenceScore: 90 },
    });
    expect(
      (await request(`/api/admin/v1/aliases/${String(alias.id)}`, { method: 'DELETE' })).status,
    ).toBe(204);
  });

  it('reviews candidates and submissions without silently creating live handles', async () => {
    const candidate = await createCreatorCandidateRepository(env.DB).create({
      canonicalName: 'Candidate Phase Five',
      category: 'video',
      countryCodes: ['GH'],
      discoverySource: 'test_connector',
      confidenceScore: 88,
    });
    const approved = await request(
      `/api/admin/v1/candidates/${candidate.id}/approve`,
      jsonInit({ reason: 'Evidence reviewed in integration test.', create_creator_draft: true }),
    );
    expect(approved.status).toBe(200);
    expect((await responseData(approved)).handles_created).toBe(0);

    const submission = await createPublicSubmissionRepository(env.DB).create({
      creatorName: 'Submission Phase Five',
      category: 'music',
      countryCodes: ['NG'],
      requestedHandles: ['submission_phase_five'],
      publicSources: ['https://example.test/submission'],
      batchReference: 'ba000000-0000-4000-8000-000000000001',
      batchRowNumber: 2,
    });
    const batchDetail = await request(`/api/admin/v1/submissions/${submission.id}`);
    await expect(batchDetail.json()).resolves.toMatchObject({
      data: {
        submission: {
          batch_reference: 'ba000000-0000-4000-8000-000000000001',
          batch_row_number: 2,
        },
      },
    });
    const converted = await request(
      `/api/admin/v1/submissions/${submission.id}/convert-to-candidate`,
      jsonInit({ reason: 'Public evidence needs candidate review.' }),
    );
    expect(converted.status).toBe(201);
    expect((await responseData(converted)).live_handles_created).toBe(0);
    expect(
      await createReservedHandleRepository(env.DB).findExact('submission_phase_five'),
    ).toBeNull();

    const legacySubmission = await createPublicSubmissionRepository(env.DB).create({
      creatorName: 'Legacy Category Submission',
      category: 'Legacy Video / Online',
      countryCodes: ['ZZ'],
      requestedHandles: ['legacy_category_submission'],
      publicSources: ['https://example.test/legacy-category-submission'],
    });
    const legacyDetail = await request(`/api/admin/v1/submissions/${legacySubmission.id}`);
    expect(legacyDetail.status).toBe(200);
    await expect(legacyDetail.json()).resolves.toMatchObject({
      data: {
        submission: {
          category: 'Legacy Video / Online',
          country_codes: ['ZZ'],
        },
      },
    });
    const legacyConversion = await request(
      `/api/admin/v1/submissions/${legacySubmission.id}/convert-to-candidate`,
      jsonInit({ reason: 'Preserve legacy submission values during review.' }),
    );
    expect(legacyConversion.status).toBe(201);
    await expect(legacyConversion.json()).resolves.toMatchObject({
      data: {
        candidate: {
          category: 'Legacy Video / Online',
          country_codes: ['ZZ'],
        },
      },
    });

    const missingCategorySubmission = await createPublicSubmissionRepository(env.DB).create({
      creatorName: 'Missing Category Submission',
      category: null,
      countryCodes: null,
      requestedHandles: ['missing_category_submission'],
      publicSources: ['https://example.test/missing-category-submission'],
    });
    const missingDetail = await request(
      `/api/admin/v1/submissions/${missingCategorySubmission.id}`,
    );
    expect(missingDetail.status).toBe(200);
    await expect(missingDetail.json()).resolves.toMatchObject({
      data: { submission: { category: null, country_codes: null } },
    });
  });
});

describe('critical handles, imports, releases and audit', () => {
  it('includes proposed handles and profiles in creator approval history before they exist', async () => {
    const creatorId = '10000000-0000-4000-8000-000000000001';
    const handle = await request(
      '/api/admin/v1/reserved-handles',
      jsonInit({
        creator_entity_id: creatorId,
        display_handle: 'demo_pending_association',
        classification: 'hard_reserved',
        confidence_score: 95,
        decision_source: 'integration_test',
        reason: 'Demonstration request for creator association coverage.',
        status: 'active',
      }),
    );
    const profile = await request(
      `/api/admin/v1/creators/${creatorId}/profiles`,
      jsonInit({
        platform: 'youtube',
        platform_account_id: 'demonstration-pending-channel',
        profile_url: 'https://www.youtube.com/channel/demonstration-pending-channel',
        verification_status: 'cross_source_confirmed',
        visibility_status: 'public',
        source_name: 'Demonstration evidence',
        confidence_score: 95,
        change_reason: 'Demonstration request for creator association coverage.',
      }),
    );
    expect(handle.status).toBe(202);
    expect(profile.status).toBe(202);
    const handleApproval = (await responseData(handle)).approval_request as { id: string };
    const profileApproval = await responseData(profile);
    const detail = await responseData(
      await request(`/api/admin/v1/creators/${creatorId}`, undefined, viewerBindings),
    );
    expect(detail.approval_requests).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: handleApproval.id,
          action_type: 'handle.create_critical',
          status: 'pending',
        }),
        expect.objectContaining({
          id: profileApproval.id,
          action_type: 'external_profile.create_critical',
          status: 'pending',
        }),
      ]),
    );
    const other = await responseData(
      await request('/api/admin/v1/creators/10000000-0000-4000-8000-000000000002'),
    );
    expect(other.approval_requests).toEqual([]);
    expect(
      await createReservedHandleRepository(env.DB).findExact('demo_pending_association'),
    ).toBeNull();
    expect(
      await createExternalProfileRepository(env.DB).findByPlatformAccountId(
        'youtube',
        'demonstration-pending-channel',
      ),
    ).toBeNull();
    expect(await createAdminApprovalRepository(env.DB).listDecisions(handleApproval.id)).toEqual(
      [],
    );
  });

  it('associates current targets and proposed owners without unrelated or duplicate requests', async () => {
    const creatorId = '10000000-0000-4000-8000-000000000001';
    const otherId = '10000000-0000-4000-8000-000000000002';
    const handle = (await createReservedHandleRepository(env.DB).listByCreator(creatorId))[0];
    const profile = (await createExternalProfileRepository(env.DB).listByCreator(creatorId))[0];
    if (!handle || !profile) throw new Error('Expected demonstration handle and profile.');
    const repository = createAdminApprovalRepository(env.DB);
    const common = {
      requestedBy: 'admin-one@example.test',
      reason: 'Demonstration association regression fixture.',
      expiresAt: '2026-07-22T18:00:00.000Z',
      requestId: metadata.createRequestId(),
    };
    const transfer = await repository.create({
      ...common,
      actionType: 'handle.update_critical',
      entityType: 'reserved_handle',
      entityId: handle.id,
      requestedPayload: { id: handle.id, creatorEntityId: otherId },
    });
    const suppression = await repository.create({
      ...common,
      actionType: 'external_profile.delete_critical',
      entityType: 'creator_external_profile',
      entityId: profile.id,
      requestedPayload: { id: profile.id },
    });
    const overlapping = await repository.create({
      ...common,
      actionType: 'external_profile.update_critical',
      entityType: 'creator_external_profile',
      entityId: profile.id,
      requestedPayload: { id: profile.id, creatorEntityId: creatorId },
    });
    const direct = await repository.create({
      ...common,
      actionType: 'critical.emergency_override',
      entityType: 'creator_entity',
      entityId: creatorId,
      requestedPayload: {},
    });
    await env.DB.prepare("UPDATE admin_approval_requests SET status = 'expired' WHERE id = ?")
      .bind(direct.id)
      .run();
    await repository.create({
      ...common,
      actionType: 'release.publish',
      entityType: 'registry_release',
      entityId: creatorId,
      requestedPayload: { creatorEntityId: creatorId },
    });
    const auditsBefore = await createAuditLogRepository(env.DB).count({});
    const detail = await responseData(await request(`/api/admin/v1/creators/${creatorId}`));
    const approvals = detail.approval_requests as Array<{ id: string; status: string }>;
    expect(approvals.map((item) => item.id).sort()).toEqual(
      [transfer.id, suppression.id, overlapping.id, direct.id].sort(),
    );
    expect(approvals.find((item) => item.id === direct.id)?.status).toBe('expired');
    const other = await responseData(await request(`/api/admin/v1/creators/${otherId}`));
    expect(other.approval_requests).toEqual([expect.objectContaining({ id: transfer.id })]);
    const firstPage = await repository.listByCreator(creatorId, { page: 1, limit: 2 });
    const secondPage = await repository.listByCreator(creatorId, { page: 2, limit: 2 });
    expect([...firstPage.items, ...secondPage.items].map((item) => item.id)).toEqual(
      approvals.map((item) => item.id),
    );
    expect(await createAuditLogRepository(env.DB).count({})).toBe(auditsBefore);
    expect(await createReservedHandleRepository(env.DB).findById(handle.id)).toEqual(handle);
    expect(await createExternalProfileRepository(env.DB).findById(profile.id)).toEqual(profile);
  });

  const expiryReason = 'Record the elapsed deadline without applying or reissuing the change.';

  async function expiredRequest(
    actionType:
      | 'handle.create_critical'
      | 'external_profile.create_critical'
      | 'release.publish' = 'handle.create_critical',
    expiresAt = metadata.now(),
  ) {
    return createAdminApprovalRepository(env.DB, {
      createId: () => crypto.randomUUID(),
      now: () => '2026-07-20T18:00:00.000Z',
    }).create({
      actionType,
      entityType: actionType === 'release.publish' ? 'registry_release' : 'creator_entity',
      entityId: '10000000-0000-4000-8000-000000000001',
      requestedBy: 'admin-one@example.test',
      requestedPayload: { fixture: 'Expired proposal must never be applied.' },
      reason: 'Demonstration approval for expiry regression coverage.',
      expiresAt,
      requestId: metadata.createRequestId(),
    });
  }

  it.each([
    'handle.create_critical',
    'external_profile.create_critical',
    'release.publish',
  ] as const)(
    'audits expiry of %s at its deadline without applying or deciding it',
    async (actionType) => {
      const approval = await expiredRequest(actionType);
      const repository = createAdminApprovalRepository(env.DB);
      const countsBefore = await env.DB.prepare(
        `SELECT (SELECT COUNT(*) FROM reserved_handles) AS handles,
          (SELECT COUNT(*) FROM creator_external_profiles) AS profiles,
          (SELECT COUNT(*) FROM creator_entities) AS creators,
          (SELECT COUNT(*) FROM registry_releases WHERE release_status = 'published') AS releases`,
      ).first();
      const response = await request(
        `/api/admin/v1/approval-requests/${approval.id}/expire`,
        jsonInit({ reason: expiryReason, expected_revision: approval.updatedAt }),
      );
      expect(response.status).toBe(200);
      expect(await responseData(response)).toMatchObject({
        id: approval.id,
        status: 'expired',
        resolved_at: metadata.now(),
        updated_at: metadata.now(),
        applied_at: null,
        approval_count: 0,
      });
      expect(await repository.listDecisions(approval.id)).toEqual([]);
      const audits = await createAuditLogRepository(env.DB).list({
        entityType: 'admin_approval_request',
        entityId: approval.id,
      });
      expect(audits.items.filter((audit) => audit.action === 'approval.expired')).toHaveLength(1);
      expect(audits.items.find((audit) => audit.action === 'approval.expired')).toMatchObject({
        actorIdentifier: 'admin-one@example.test',
        previousValue: { status: 'pending', updated_at: approval.updatedAt },
        newValue: { status: 'expired', reason: expiryReason, expires_at: approval.expiresAt },
        metadata: { request_id: metadata.createRequestId() },
      });
      expect(
        await env.DB.prepare(
          `SELECT (SELECT COUNT(*) FROM reserved_handles) AS handles,
            (SELECT COUNT(*) FROM creator_external_profiles) AS profiles,
            (SELECT COUNT(*) FROM creator_entities) AS creators,
            (SELECT COUNT(*) FROM registry_releases WHERE release_status = 'published') AS releases`,
        ).first(),
      ).toEqual(countsBefore);
      const replay = await request(
        `/api/admin/v1/approval-requests/${approval.id}/expire`,
        jsonInit({ reason: expiryReason, expected_revision: approval.updatedAt }),
      );
      expect(replay.status).toBe(422);
      expect(await repository.count({ status: 'expired' })).toBe(1);
    },
  );

  it('rejects premature, stale, invalid and unauthorized expiry without changing the request', async () => {
    const approval = await expiredRequest('handle.create_critical', '2026-07-22T18:00:00.000Z');
    const body = { reason: expiryReason, expected_revision: approval.updatedAt };
    const path = `/api/admin/v1/approval-requests/${approval.id}/expire`;
    expect((await request(path, jsonInit(body))).status).toBe(422);
    expect((await request(path, jsonInit(body), viewerBindings)).status).toBe(403);
    expect((await request(path, jsonInit({ reason: expiryReason }))).status).toBe(422);
    expect((await request(path, jsonInit({ ...body, status: 'expired' }))).status).toBe(422);
    const pastDue = await expiredRequest();
    expect(
      (
        await request(
          `/api/admin/v1/approval-requests/${pastDue.id}/expire`,
          jsonInit({ ...body, expected_revision: '2026-07-19T18:00:00.000Z' }),
        )
      ).status,
    ).toBe(422);
    const repository = createAdminApprovalRepository(env.DB);
    expect(await repository.findById(approval.id)).toEqual(approval);
    expect(await repository.findById(pastDue.id)).toEqual(pastDue);
    expect(await createAuditLogRepository(env.DB).count({ action: 'approval.expired' })).toBe(0);
  });

  it('rolls back expiry when its audit write fails', async () => {
    const approval = await expiredRequest();
    await env.DB.prepare(
      `CREATE TRIGGER reject_expiry_audit BEFORE INSERT ON audit_logs
       WHEN NEW.action = 'approval.expired' BEGIN SELECT RAISE(ABORT, 'audit unavailable'); END;`,
    ).run();
    try {
      const response = await request(
        `/api/admin/v1/approval-requests/${approval.id}/expire`,
        jsonInit({ reason: expiryReason, expected_revision: approval.updatedAt }),
      );
      expect(response.status).toBe(503);
      expect(await createAdminApprovalRepository(env.DB).findById(approval.id)).toEqual(approval);
      expect(
        await env.DB.prepare('SELECT COUNT(*) AS count FROM admin_mutation_guards').first(),
      ).toEqual({ count: 0 });
    } finally {
      await env.DB.exec('DROP TRIGGER reject_expiry_audit');
    }
  });

  it('allows only one concurrent expiry and preserves approved release decisions', async () => {
    const approval = await expiredRequest('release.publish');
    await env.DB.prepare(
      "UPDATE admin_approval_requests SET status = 'approved', approval_count = 1 WHERE id = ?",
    )
      .bind(approval.id)
      .run();
    await env.DB.prepare(
      `INSERT INTO admin_approval_decisions
       (id, approval_request_id, administrator_identifier, decision, reason, created_at)
       VALUES (?, ?, 'admin-two@example.test', 'approved', 'Reviewed demonstration release.', ?)`,
    )
      .bind(crypto.randomUUID(), approval.id, '2026-07-20T19:00:00.000Z')
      .run();
    const repository = createAdminApprovalRepository(env.DB);
    const decisionsBefore = await repository.listDecisions(approval.id);
    const path = `/api/admin/v1/approval-requests/${approval.id}/expire`;
    const responses = await Promise.all([
      request(path, jsonInit({ reason: expiryReason, expected_revision: approval.updatedAt })),
      request(path, jsonInit({ reason: expiryReason, expected_revision: approval.updatedAt })),
    ]);
    expect(responses.filter((response) => response.status === 200)).toHaveLength(1);
    expect(responses.every((response) => [200, 409, 422].includes(response.status))).toBe(true);
    expect(await createAdminApprovalRepository(env.DB).findById(approval.id)).toMatchObject({
      status: 'expired',
      approvalCount: 1,
      appliedAt: null,
    });
    expect(await createAuditLogRepository(env.DB).count({ action: 'approval.expired' })).toBe(1);
    expect(await repository.listDecisions(approval.id)).toEqual(decisionsBefore);
  });

  it.each(['rejected', 'applied', 'expired', 'invalid'] as const)(
    'refuses to expire a terminal %s request',
    async (status) => {
      const approval = await expiredRequest();
      await env.DB.prepare('UPDATE admin_approval_requests SET status = ? WHERE id = ?')
        .bind(status, approval.id)
        .run();
      const response = await request(
        `/api/admin/v1/approval-requests/${approval.id}/expire`,
        jsonInit({ reason: expiryReason, expected_revision: approval.updatedAt }),
      );
      expect(response.status).toBe(422);
      expect(await createAdminApprovalRepository(env.DB).findById(approval.id)).toMatchObject({
        status,
      });
      expect(await createAuditLogRepository(env.DB).count({ action: 'approval.expired' })).toBe(0);
    },
  );

  it('manages public external profiles and applies critical profile changes through approval', async () => {
    const nonCriticalCreatorId = '10000000-0000-4000-8000-000000000002';
    const createdResponse = await request(
      `/api/admin/v1/creators/${nonCriticalCreatorId}/profiles`,
      jsonInit({
        platform: 'twitter',
        platform_account_id: 'phase6-profile-account',
        platform_handle: '@phase6profile',
        profile_url: 'https://twitter.com/phase6profile',
        profile_name: 'Phase 6 Profile',
        is_primary: true,
        verification_status: 'source_linked',
        visibility_status: 'public',
        source_name: 'integration_fixture',
        source_reference: 'fixture-profile-1',
        source_license: 'CC0-1.0',
        confidence_score: 90,
        change_reason: 'Add reviewed integration profile.',
      }),
    );
    const created = await responseData(createdResponse);
    expect(createdResponse.status).toBe(201);
    expect(created.platform).toBe('x');
    expect(
      await createAuditLogRepository(env.DB).findByEntity(
        'creator_external_profile',
        String(created.id),
      ),
    ).toEqual([expect.objectContaining({ action: 'external_profile.created' })]);

    const provenanceUpdate = await request(
      `/api/admin/v1/external-profiles/${String(created.id)}`,
      {
        ...jsonInit({
          verification_status: 'cross_source_confirmed',
          source_reference: 'fixture-profile-1-reviewed',
          change_reason: 'Record additional fictional profile provenance.',
        }),
        method: 'PATCH',
      },
    );
    expect(provenanceUpdate.status).toBe(200);
    expect(await responseData(provenanceUpdate)).toMatchObject({
      is_primary: true,
      verification_status: 'cross_source_confirmed',
      source_reference: 'fixture-profile-1-reviewed',
    });
    expect(
      (
        await createAuditLogRepository(env.DB).findByEntity(
          'creator_external_profile',
          String(created.id),
        )
      )[0],
    ).toMatchObject({
      action: 'external_profile.updated',
      previousValue: { isPrimary: true },
      newValue: { isPrimary: true },
    });

    const explicitNonPrimary = await request(
      `/api/admin/v1/external-profiles/${String(created.id)}`,
      {
        ...jsonInit({
          is_primary: false,
          change_reason: 'Intentionally unset the fictional primary profile.',
        }),
        method: 'PATCH',
      },
    );
    expect(explicitNonPrimary.status).toBe(200);
    expect((await responseData(explicitNonPrimary)).is_primary).toBe(false);

    const criticalResponse = await request(
      '/api/admin/v1/creators/10000000-0000-4000-8000-000000000001/profiles',
      jsonInit({
        platform: 'spotify',
        platform_account_id: 'phase6-critical-spotify',
        profile_url: 'https://open.spotify.com/artist/phase6-critical-spotify',
        is_primary: true,
        verification_status: 'manually_verified',
        visibility_status: 'public',
        source_name: 'manual_review',
        confidence_score: 100,
        change_reason: 'Add reviewed critical creator profile.',
      }),
    );
    const approval = await responseData(criticalResponse);
    expect(criticalResponse.status).toBe(202);
    expect(
      await createExternalProfileRepository(env.DB).findByPlatformAccountId(
        'spotify',
        'phase6-critical-spotify',
      ),
    ).toBeNull();
    const applied = await request(
      `/api/admin/v1/approval-requests/${String(approval.id)}/approve`,
      jsonInit({ reason: 'Independent administrator confirmed the association.' }, 'secondary'),
    );
    expect(applied.status).toBe(200);
    expect(
      await createExternalProfileRepository(env.DB).findByPlatformAccountId(
        'spotify',
        'phase6-critical-spotify',
      ),
    ).toMatchObject({ visibilityStatus: 'public' });
  });

  it('previews and runs fixture-backed Wikidata with audited configuration changes', async () => {
    const configured = await request('/api/admin/v1/source-configurations/wikidata', {
      ...jsonInit({
        enabled: true,
        dry_run: false,
        minimum_request_interval_ms: 0,
        reason: 'Enable deterministic integration fixture.',
      }),
      method: 'PATCH',
    });
    expect(configured.status).toBe(200);
    const preview = await request(
      '/api/admin/v1/ingestion-runs/preview',
      jsonInit({ source_name: 'wikidata', scope_key: 'preview' }),
    );
    expect(preview.status).toBe(200);
    expect(await responseData(preview)).toMatchObject({ dry_run: true, fetched_count: 2 });
    const run = await request(
      '/api/admin/v1/ingestion-runs/start',
      jsonInit({ source_name: 'wikidata', scope_key: 'default' }),
    );
    const result = await responseData(run);
    expect(run.status).toBe(200);
    expect(result).toMatchObject({ status: 'completed', created_count: 2 });
    const detail = await request(`/api/admin/v1/ingestion-runs/${String(result.run_id)}`);
    expect(detail.status).toBe(200);
    expect(
      await createAuditLogRepository(env.DB).list({ action: 'ingestion.started' }),
    ).toMatchObject({ items: [expect.objectContaining({ entityId: result.run_id })] });
  });

  it('applies a critical handle once only after a different super administrator approves', async () => {
    const create = await request(
      '/api/admin/v1/reserved-handles',
      jsonInit({
        creator_entity_id: '10000000-0000-4000-8000-000000000001',
        display_handle: 'phase5_critical_handle',
        classification: 'hard_reserved',
        confidence_score: 100,
        decision_source: 'integration_test',
        reason: 'Critical exact handle created for approval integration coverage.',
        status: 'active',
      }),
    );
    const data = await responseData(create);
    const approval = data.approval_request as Record<string, unknown>;
    const approvalId = String(approval.id);
    expect(create.status).toBe(202);
    expect(
      await createReservedHandleRepository(env.DB).findExact('phase5_critical_handle'),
    ).toBeNull();

    const selfApproval = await request(
      `/api/admin/v1/approval-requests/${approvalId}/approve`,
      jsonInit({ reason: 'Requester must not approve.' }),
    );
    expect(selfApproval.status).toBe(422);
    const secondApproval = await request(
      `/api/admin/v1/approval-requests/${approvalId}/approve`,
      jsonInit({ reason: 'Independent second-person review approved.' }, 'secondary'),
    );
    expect(secondApproval.status).toBe(200);
    expect(
      (await createReservedHandleRepository(env.DB).findExact('phase5_critical_handle'))?.status,
    ).toBe('active');
    expect(
      (
        await request(
          `/api/admin/v1/approval-requests/${approvalId}/approve`,
          jsonInit({ reason: 'Replay must fail.' }, 'secondary'),
        )
      ).status,
    ).toBe(422);
  });

  it('preserves conservative public behavior when suspending and releasing a non-critical handle', async () => {
    const creatorResponse = await request(
      '/api/admin/v1/creators',
      jsonInit({
        canonical_name: 'Handle State Creator',
        entity_type: 'person',
        notoriety_score: 55,
        protection_tier: 'notable',
        review_status: 'approved',
      }),
    );
    const creator = await responseData(creatorResponse);
    const handleResponse = await request(
      '/api/admin/v1/reserved-handles',
      jsonInit({
        creator_entity_id: creator.id,
        display_handle: 'phase5_state_handle',
        classification: 'hard_reserved',
        confidence_score: 95,
        decision_source: 'integration_test',
        reason: 'Non-critical handle state coverage for public behavior.',
        status: 'active',
      }),
    );
    const handle = await responseData(handleResponse);
    const publicBindings = {
      DB: env.DB,
      ENVIRONMENT: 'local',
      ALLOWED_ORIGINS: 'http://localhost:5173',
    } satisfies PublicRuntimeBindings;
    const publicApp = createPublicApp({ metadata });

    await request(
      `/api/admin/v1/reserved-handles/${String(handle.id)}/suspend`,
      jsonInit({ reason: 'Temporary evidence review.' }),
    );
    const suspendedBody = await (
      await publicApp.request(
        '/api/v1/handles/check?handle=phase5_state_handle',
        undefined,
        publicBindings,
      )
    ).json<Record<string, { registry_status: string }>>();
    expect(suspendedBody.data?.registry_status).toBe('soft_protected');
    await request(
      `/api/admin/v1/reserved-handles/${String(handle.id)}/release`,
      jsonInit({ reason: 'Evidence no longer supports exact reservation.' }),
    );
    const releasedBody = await (
      await publicApp.request(
        '/api/v1/handles/check?handle=phase5_state_handle',
        undefined,
        publicBindings,
      )
    ).json<Record<string, { registry_status: string }>>();
    expect(releasedBody.data?.registry_status).toBe('not_listed');
  });

  it('does not reactivate non-active handles when unrelated fields are patched', async () => {
    const creator = await responseData(
      await request(
        '/api/admin/v1/creators',
        jsonInit({
          canonical_name: 'Fictional Handle Lifecycle Creator',
          entity_type: 'person',
          protection_tier: 'notable',
          review_status: 'approved',
        }),
      ),
    );
    const states = ['suspended', 'released', 'disputed'] as const;
    const handles: Array<{ id: string; status: (typeof states)[number] }> = [];

    for (const status of states) {
      const handle = await responseData(
        await request(
          '/api/admin/v1/reserved-handles',
          jsonInit({
            creator_entity_id: creator.id,
            display_handle: `fictional_${status}_handle`,
            classification: 'monitored',
            confidence_score: 70,
            decision_source: 'patch_regression_test',
            reason: `Fictional ${status} handle used for PATCH lifecycle coverage.`,
            status,
          }),
        ),
      );
      handles.push({ id: String(handle.id), status });
    }

    for (const handle of handles) {
      const update = await request(`/api/admin/v1/reserved-handles/${handle.id}`, {
        ...jsonInit({
          reason: `Update fictional ${handle.status} evidence without changing lifecycle status.`,
        }),
        method: 'PATCH',
      });
      expect(update.status).toBe(200);
      expect((await responseData(update)).status).toBe(handle.status);
      expect(
        (await createAuditLogRepository(env.DB).findByEntity('reserved_handle', handle.id))[0],
      ).toMatchObject({
        action: 'handle.updated',
        previousValue: { status: handle.status },
        newValue: { status: handle.status },
      });
    }

    const explicitRestore = await request(
      `/api/admin/v1/reserved-handles/${handles[0]?.id ?? ''}`,
      {
        ...jsonInit({ status: 'active' }),
        method: 'PATCH',
      },
    );
    expect(explicitRestore.status).toBe(200);
    expect((await responseData(explicitRestore)).status).toBe('active');
  });

  it('previews CSV/JSON without mutation, commits by checksum, and is idempotent', async () => {
    const content = JSON.stringify([
      {
        record_type: 'creator',
        canonical_name: 'Imported Phase Five',
        entity_type: 'person',
        primary_category: 'art',
        country_codes: ['NG'],
        notoriety_score: 50,
        protection_tier: 'standard',
        review_status: 'pending',
      },
    ]);
    const preview = await request(
      '/api/admin/v1/imports/preview',
      jsonInit({ format: 'json', file_name: 'phase5.json', content }),
    );
    const previewData = await responseData(preview);
    const batch = previewData.batch as Record<string, unknown>;
    expect(preview.status).toBe(201);
    const previewAudits = await createAuditLogRepository(env.DB).findByEntity(
      'import_batch',
      String(batch.id),
    );
    expect(previewAudits[0]?.newValue).toEqual({
      format: 'json',
      file_name: 'phase5.json',
      status: 'previewed',
      total_rows: 1,
      valid_rows: 1,
      invalid_rows: 0,
      duplicate_rows: 0,
      warning_rows: 0,
    });
    expect(JSON.stringify(previewAudits)).not.toContain('Imported Phase Five');
    expect((await request('/api/admin/v1/creators?query=Imported%20Phase%20Five')).status).toBe(
      200,
    );

    const commitBody = { import_id: batch.id, checksum: batch.checksum };
    const committed = await request('/api/admin/v1/imports/commit', jsonInit(commitBody));
    const repeated = await request('/api/admin/v1/imports/commit', jsonInit(commitBody));
    expect(committed.status).toBe(200);
    expect(repeated.status).toBe(200);
    const count = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM creator_entities WHERE normalized_name = 'imported phase five'",
    ).first<{ count: number }>();
    expect(count?.count).toBe(1);

    const csv =
      'record_type,canonical_name,entity_type,notoriety_score,protection_tier,review_status\ncreator,"CSV, Creator",person,40,standard,pending';
    expect(
      (
        await request(
          '/api/admin/v1/imports/preview',
          jsonInit({ format: 'csv', file_name: 'phase5.csv', content: csv }),
        )
      ).status,
    ).toBe(201);

    const aliasPreview = await request(
      '/api/admin/v1/imports/preview',
      jsonInit({
        format: 'json',
        file_name: 'punctuation-alias.json',
        content: JSON.stringify([
          {
            record_type: 'alias',
            creator_name: 'Demo Aurora Vale',
            alias: 'Her First $100K',
            language: 'en',
            alias_type: 'known_alias',
            confidence_score: 100,
            source_id: '20000000-0000-4000-8000-000000000001',
          },
        ]),
      }),
    );
    expect(aliasPreview.status).toBe(201);
    expect(await responseData(aliasPreview)).toMatchObject({
      batch: { valid_rows: 1, invalid_rows: 0 },
      records: [
        {
          alias: 'Her First $100K',
          normalized_alias: 'her_first_100k',
          confusable_skeleton: 'herfirstlook',
        },
      ],
    });
  });

  it('requires different-person release approval and publishes atomically to the public API', async () => {
    const created = await responseData(
      await request(
        '/api/admin/v1/releases',
        jsonInit({ version: 'phase5-test.1', reason: 'Integration release draft.' }),
      ),
    );
    const releaseId = String(created.id);
    expect(
      (
        await request(
          `/api/admin/v1/releases/${releaseId}/calculate`,
          jsonInit({ reason: 'Calculate deterministic contents.' }),
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await request(
          `/api/admin/v1/releases/${releaseId}/request-approval`,
          jsonInit({ reason: 'Request independent publication approval.' }),
        )
      ).status,
    ).toBe(202);
    expect(
      (
        await request(
          `/api/admin/v1/releases/${releaseId}/approve`,
          jsonInit({ reason: 'Self approval must fail.' }),
        )
      ).status,
    ).toBe(422);
    expect(
      (
        await request(
          `/api/admin/v1/releases/${releaseId}/approve`,
          jsonInit({ reason: 'Second publisher reviewed the checksum.' }, 'secondary'),
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await request(
          `/api/admin/v1/releases/${releaseId}/publish`,
          jsonInit({ reason: 'Publish the approved immutable snapshot.' }),
        )
      ).status,
    ).toBe(200);

    const publicBindings = {
      DB: env.DB,
      ENVIRONMENT: 'local',
      ALLOWED_ORIGINS: 'http://localhost:5173',
    } satisfies PublicRuntimeBindings;
    const publicResponse = await createPublicApp({ metadata }).request(
      '/api/v1/registry/releases',
      undefined,
      publicBindings,
    );
    const publicBody = await publicResponse.json<Record<string, unknown>>();
    expect(JSON.stringify(publicBody)).toContain('phase5-test.1');
  });

  it('protects private documentation and exposes append-only audit visibility', async () => {
    const denied = await request('/admin-openapi.json', undefined, {
      ...superAdminBindings,
      AUTH_PROVIDER: 'unconfigured',
    });
    const spec = await request('/admin-openapi.json');
    const docs = await request('/admin-docs');
    const auditList = await request('/api/admin/v1/audit-logs');

    expect(denied.status).toBe(401);
    expect(spec.status).toBe(200);
    expect((await spec.json<Record<string, unknown>>()).openapi).toBe('3.1.0');
    expect(docs.status).toBe(200);
    expect(auditList.status).toBe(200);
    expect('update' in createAuditLogRepository(env.DB)).toBe(false);
    expect('delete' in createAuditLogRepository(env.DB)).toBe(false);
  });
});
