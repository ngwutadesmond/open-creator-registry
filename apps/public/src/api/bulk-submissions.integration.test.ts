import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';

import { createCreatorCandidateRepository } from '@open-creator-registry/database/repositories/creator-candidate-repository';
import { createCreatorRepository } from '@open-creator-registry/database/repositories/creator-repository';
import { createPublicSubmissionRepository } from '@open-creator-registry/database/repositories/public-submission-repository';
import { createRegistryReleaseRepository } from '@open-creator-registry/database/repositories/registry-release-repository';
import { createReservedHandleRepository } from '@open-creator-registry/database/repositories/reserved-handle-repository';

import { createPublicApp } from './routes';
import { bulkSubmissionCommitResponseSchema, bulkSubmissionPreviewResponseSchema } from './schemas';
import {
  deterministicRequestMetadata,
  requestApi,
  resetAndSeedApiDatabase,
  testBindings,
} from './test-utils';

beforeEach(resetAndSeedApiDatabase);

const rows = [
  {
    row_number: 2,
    creator_name: 'Registry Batch Test One',
    category: 'Music',
    countries: ['Nigeria', 'gh'],
    requested_usernames: ['@registry.batch.test.one'],
    public_sources: ['https://example.test/registry-batch-one'],
  },
  {
    row_number: 3,
    creator_name: 'Registry Batch Test Two',
    category: 'content_creator',
    countries: ['US'],
    requested_usernames: ['registry_batch_test_two'],
    public_sources: ['https://example.org/registry-batch-two'],
  },
] as const;

async function preview(inputRows: unknown = rows) {
  const response = await requestApi('/api/v1/submissions/bulk/preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rows: inputRows }),
  });
  return { response, body: bulkSubmissionPreviewResponseSchema.parse(await response.json()) };
}

function commitBody(
  previewChecksum: string,
  inputRows: unknown = rows,
  selectedRowNumbers = [2, 3],
) {
  return {
    commit_id: 'ba000000-0000-4000-8000-000000000001',
    preview_checksum: previewChecksum,
    rows: inputRows,
    selected_row_numbers: selectedRowNumbers,
    confirmed_possible_duplicate_row_numbers: [],
  };
}

async function postCommit(body: unknown) {
  return requestApi('/api/v1/submissions/bulk/commit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('public bulk creator submissions', () => {
  it('normalizes supported labels and values during a mutation-free preview', async () => {
    const repository = createPublicSubmissionRepository(env.DB);
    const before = await repository.count();
    const { response, body } = await preview();

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(body.data.summary).toEqual({
      total_rows: 2,
      ready: 2,
      exact_duplicates: 0,
      possible_duplicates: 0,
      invalid: 0,
      rows_with_warnings: 0,
    });
    expect(body.data.rows[0]?.normalized).toMatchObject({
      creator_name: 'Registry Batch Test One',
      category: 'music',
      country_codes: ['NG', 'GH'],
    });
    expect(body.meta).toEqual({
      request_id: '90000000-0000-4000-8000-000000000001',
      timestamp: '2026-07-21T16:00:00.000Z',
    });
    expect(await repository.count()).toBe(before);
  });

  it('returns mixed row validation and within-file duplicate outcomes', async () => {
    const duplicate = { ...rows[0], row_number: 4 };
    const invalidCategory = { ...rows[1], row_number: 5, category: 'made_up' };
    const invalidCountry = { ...rows[1], row_number: 6, countries: ['ZZ'] };
    const duplicateCountry = { ...rows[1], row_number: 7, countries: ['Nigeria', 'ng'] };
    const duplicateHandle = {
      ...rows[1],
      row_number: 8,
      requested_usernames: ['creator-name', '@Creator.Name'],
    };
    const duplicateSource = {
      ...rows[1],
      row_number: 9,
      public_sources: ['https://EXAMPLE.org/path', 'https://example.org/path'],
    };
    const invalidUrl = { ...rows[1], row_number: 10, public_sources: ['file:///private'] };
    const { body } = await preview([
      ...rows,
      duplicate,
      invalidCategory,
      invalidCountry,
      duplicateCountry,
      duplicateHandle,
      duplicateSource,
      invalidUrl,
    ]);

    expect(body.data.summary).toMatchObject({
      total_rows: 9,
      ready: 2,
      exact_duplicates: 1,
      invalid: 6,
    });
    expect(body.data.rows[2]).toMatchObject({
      row_number: 4,
      status: 'exact_duplicate',
      duplicate_scope: 'within_file',
      duplicate_of_row: 2,
    });
    expect(body.data.rows.flatMap(({ errors }) => errors.map(({ code }) => code))).toEqual(
      expect.arrayContaining([
        'unsupported_category',
        'unknown_country',
        'duplicate_country',
        'duplicate_username',
        'duplicate_source_url',
        'invalid_source_url',
      ]),
    );
  });

  it('commits normal pending submissions atomically without changing Registry records', async () => {
    const creators = createCreatorRepository(env.DB);
    const candidates = createCreatorCandidateRepository(env.DB);
    const handles = createReservedHandleRepository(env.DB);
    const releases = createRegistryReleaseRepository(env.DB);
    const submissions = createPublicSubmissionRepository(env.DB);
    const before = {
      creators: await creators.count(),
      candidates: await candidates.count(),
      handles: await handles.count(),
      releases: await releases.count(),
    };
    const previewResult = await preview();
    const response = await postCommit(commitBody(previewResult.body.data.preview_checksum));
    const body = bulkSubmissionCommitResponseSchema.parse(await response.json());

    expect(response.status).toBe(200);
    expect(body.data).toMatchObject({
      submitted_rows: 2,
      total_pending_submissions_created: 2,
      idempotent_replay: false,
    });
    expect(await submissions.count({ submissionStatus: 'pending' })).toBe(2);
    for (const resultRow of body.data.rows) {
      expect(resultRow.status).toBe('submitted');
      expect(resultRow.submission_id).not.toBeNull();
      const stored = await submissions.findById(resultRow.submission_id ?? '');
      expect(stored).toMatchObject({
        submissionStatus: 'pending',
        batchReference: body.data.batch_reference,
        batchRowNumber: resultRow.row_number,
      });
    }
    expect(await creators.count()).toBe(before.creators);
    expect(await candidates.count()).toBe(before.candidates);
    expect(await handles.count()).toBe(before.handles);
    expect(await releases.count()).toBe(before.releases);
  });

  it('replays the same commit idempotently without inserting more submissions', async () => {
    const previewResult = await preview();
    const body = commitBody(previewResult.body.data.preview_checksum);
    const first = bulkSubmissionCommitResponseSchema.parse(await (await postCommit(body)).json());
    const replay = bulkSubmissionCommitResponseSchema.parse(await (await postCommit(body)).json());

    expect(first.data.idempotent_replay).toBe(false);
    expect(replay.data).toMatchObject({
      batch_reference: first.data.batch_reference,
      submitted_rows: 2,
      total_pending_submissions_created: 2,
      idempotent_replay: true,
    });
    expect(await createPublicSubmissionRepository(env.DB).count()).toBe(2);
  });

  it('rejects checksum manipulation, invalid selections, and unconfirmed possible duplicates', async () => {
    const previewResult = await preview();
    const manipulated = await postCommit({
      ...commitBody(previewResult.body.data.preview_checksum),
      rows: [{ ...rows[0], creator_name: 'Changed after preview' }, rows[1]],
    });
    expect(manipulated.status).toBe(409);

    const invalidRows = [{ ...rows[0], category: 'unsupported' }];
    const invalidPreview = await preview(invalidRows);
    const invalidCommit = await postCommit(
      commitBody(invalidPreview.body.data.preview_checksum, invalidRows, [2]),
    );
    expect(invalidCommit.status).toBe(422);

    await requestApi('/api/v1/submissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        creator_name: rows[0].creator_name,
        category: 'music',
        country_codes: ['NG'],
        requested_handles: ['different_existing_handle'],
        public_sources: ['https://example.test/different-existing-source'],
      }),
    });
    const possibleRows = [{ ...rows[0], row_number: 12 }];
    const possiblePreview = await preview(possibleRows);
    expect(possiblePreview.body.data.rows[0]?.status).toBe('possible_duplicate');
    const unconfirmed = await postCommit({
      ...commitBody(possiblePreview.body.data.preview_checksum, possibleRows, [12]),
      commit_id: 'ba000000-0000-4000-8000-000000000012',
    });
    expect(unconfirmed.status).toBe(422);
  });

  it('cross-deduplicates individual and bulk submissions in both directions', async () => {
    const single = {
      creator_name: rows[0].creator_name,
      category: 'music',
      country_codes: ['GH', 'NG'],
      requested_handles: ['registry-batch-test-one'],
      public_sources: rows[0].public_sources,
    };
    expect(
      (
        await requestApi('/api/v1/submissions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(single),
        })
      ).status,
    ).toBe(201);
    const bulkAfterSingle = await preview([rows[0]]);
    expect(bulkAfterSingle.body.data.rows[0]).toMatchObject({
      status: 'exact_duplicate',
      duplicate_scope: 'existing',
    });

    const secondPreview = await preview([rows[1]]);
    const secondCommit = await postCommit({
      ...commitBody(secondPreview.body.data.preview_checksum, [rows[1]], [3]),
      commit_id: 'ba000000-0000-4000-8000-000000000003',
    });
    expect(secondCommit.status).toBe(200);
    const singleAfterBulk = await requestApi('/api/v1/submissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        creator_name: rows[1].creator_name,
        category: rows[1].category,
        country_codes: rows[1].countries,
        requested_handles: rows[1].requested_usernames,
        public_sources: rows[1].public_sources,
      }),
    });
    expect(singleAfterBulk.status).toBe(409);
  });

  it('handles simultaneous identical commits conservatively', async () => {
    const previewResult = await preview([rows[0]]);
    const body = commitBody(previewResult.body.data.preview_checksum, [rows[0]], [2]);
    const [first, second] = await Promise.all([postCommit(body), postCommit(body)]);
    expect([first.status, second.status]).toEqual([200, 200]);
    const results = await Promise.all(
      [first, second].map(async (response) =>
        bulkSubmissionCommitResponseSchema.parse(await response.json()),
      ),
    );
    expect(results.some(({ data }) => data.idempotent_replay)).toBe(true);
    expect(await createPublicSubmissionRepository(env.DB).count()).toBe(1);
  });

  it('enforces the row, body-size, media-type, and dedicated rate limits safely', async () => {
    const overLimit = Array.from({ length: 251 }, (_, index) => ({
      ...rows[0],
      row_number: index + 2,
      creator_name: `Registry Bulk Limit ${index}`,
    }));
    const overLimitResponse = await requestApi('/api/v1/submissions/bulk/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows: overLimit }),
    });
    expect(overLimitResponse.status).toBe(422);

    const oversized = await requestApi('/api/v1/submissions/bulk/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows, ignored_padding: 'x'.repeat(2 * 1024 * 1024) }),
    });
    expect(oversized.status).toBe(413);
    const wrongMedia = await requestApi('/api/v1/submissions/bulk/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ rows }),
    });
    expect(wrongMedia.status).toBe(415);

    const limitedApp = createPublicApp({
      metadata: deterministicRequestMetadata,
      rateLimiter: { check: () => Promise.resolve({ allowed: false, retryAfterSeconds: 60 }) },
    });
    const limited = await limitedApp.request(
      '/api/v1/submissions/bulk/commit',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(commitBody('0'.repeat(64))),
      },
      testBindings,
    );
    expect(limited.status).toBe(429);
    expect(limited.headers.get('Retry-After')).toBe('60');
    await expect(limited.json()).resolves.toMatchObject({ error: { code: 'rate_limited' } });
  });
});
