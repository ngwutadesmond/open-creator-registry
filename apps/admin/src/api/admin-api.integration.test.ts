import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';

import { createAuditLogRepository } from '@open-creator-registry/database/repositories/audit-log-repository';
import { createCreatorCandidateRepository } from '@open-creator-registry/database/repositories/creator-candidate-repository';
import { createPublicSubmissionRepository } from '@open-creator-registry/database/repositories/public-submission-repository';
import { createReservedHandleRepository } from '@open-creator-registry/database/repositories/reserved-handle-repository';
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
        alias_type: 'known_alias',
        confidence_score: 80,
        source_id: source.id,
      }),
    );
    const alias = await responseData(aliasResponse);
    expect(aliasResponse.status).toBe(201);
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
    expect(
      (
        await request(`/api/admin/v1/aliases/${String(alias.id)}`, {
          ...jsonInit({ confidence_score: 90 }),
          method: 'PATCH',
        })
      ).status,
    ).toBe(200);
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
  });
});

describe('critical handles, imports, releases and audit', () => {
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
