import { describe, expect, it, vi } from 'vitest';

import type { SourceConfiguration } from '@open-creator-registry/database/models';

import { createWikidataFixtureFetch, wikidataFixture } from './fixtures';
import { SourceConnectorRegistry } from './registry';
import { buildWikidataQuery, wikidataConnector } from './wikidata';

const configuration: SourceConfiguration = {
  sourceName: 'wikidata',
  enabled: true,
  scheduledEnabled: false,
  connectorVersion: '0.1.0-poc',
  accessMode: 'official_api',
  baseUrl: 'https://query.wikidata.org/sparql',
  batchSize: 10,
  maximumPagesPerRun: 2,
  maximumRecordsPerRun: 20,
  timeoutMs: 1000,
  retryCount: 2,
  minimumRequestIntervalMs: 0,
  scopeConfiguration: {
    occupation_ids: ['Q177220'],
    country_ids: [],
    maximum_failed_records: 3,
  },
  candidateCreationEnabled: true,
  dryRun: false,
  sourceLicense: 'CC0-1.0',
  attribution: 'Wikidata contributors',
  configurationStatus: 'valid',
  createdAt: '2026-07-21T00:00:00.000Z',
  updatedAt: '2026-07-21T00:00:00.000Z',
};

function context(fetchImplementation: typeof fetch = createWikidataFixtureFetch()) {
  return {
    fetch: fetchImplementation,
    now: () => '2026-07-21T00:00:00.000Z',
    sleep: vi.fn(() => Promise.resolve()),
    random: () => 0,
  };
}

describe('connector registry', () => {
  it('registers one connector and rejects duplicates and unknown names', () => {
    const registry = new SourceConnectorRegistry();
    registry.register(wikidataConnector);
    expect(registry.require('wikidata')).toBe(wikidataConnector);
    expect(() => registry.require('unknown')).toThrow('No connector');
    expect(() => registry.register(wikidataConnector)).toThrow('already registered');
  });
});

describe('Wikidata connector', () => {
  it('is disabled by default and rejects non-allowlisted endpoints', () => {
    expect(
      wikidataConnector.validateConfiguration({ ...configuration, enabled: false }).status,
    ).toBe('disabled');
    expect(
      wikidataConnector.validateConfiguration({
        ...configuration,
        baseUrl: 'https://example.com/sparql',
      }).status,
    ).toBe('invalid_configuration');
  });

  it('builds deterministic bounded queries from Q identifiers only', () => {
    const query = buildWikidataQuery({
      occupationIds: ['Q177220'],
      countryIds: ['Q30'],
      limit: 10,
      offset: 20,
    });
    expect(query).toContain('ORDER BY ASC(?item)');
    expect(query).toContain('LIMIT 10');
    expect(query).toContain('OFFSET 20');
    expect(() =>
      buildWikidataQuery({
        occupationIds: ['Q177220) } UNION { ?x ?y ?z'],
        countryIds: [],
        limit: 10,
        offset: 0,
      }),
    ).toThrow();
  });

  it('maps fixture labels, aliases, descriptions, countries, IDs, and profiles', async () => {
    const page = await wikidataConnector.fetchPage({
      configuration,
      checkpoint: null,
      pageSize: 10,
      context: context(),
    });
    expect(page.records).toHaveLength(2);
    expect(page.nextCursor).toBeNull();
    const mapped = await wikidataConnector.mapRecord(page.records[0]!, context());
    expect(mapped).toMatchObject({
      canonicalName: 'Fixture Ada Rhythm',
      normalizedName: 'fixture ada rhythm',
      aliases: ['Ada Rhythm', 'A. Rhythm'],
      description: 'fictional fixture musician',
      countryCodes: ['US'],
      occupationIds: ['Q177220'],
    });
    expect(mapped.externalProfiles.map((profile) => profile.platform)).toEqual([
      'official_website',
      'youtube',
      'instagram',
      'other',
    ]);
  });

  it('accepts missing optional fields and rejects an invalid record independently', async () => {
    const page = await wikidataConnector.fetchPage({
      configuration,
      checkpoint: null,
      pageSize: 10,
      context: context(),
    });
    const mapped = await wikidataConnector.mapRecord(page.records[1]!, context());
    expect(mapped.aliases).toEqual([]);
    await expect(
      wikidataConnector.mapRecord({ sourceRecordId: 'invalid', value: {} }, context()),
    ).rejects.toMatchObject({ code: 'SOURCE_RECORD_INVALID' });
  });

  it('rejects invalid content types and malformed responses with safe errors', async () => {
    const htmlFetch: typeof fetch = () =>
      Promise.resolve(new Response('<html></html>', { headers: { 'content-type': 'text/html' } }));
    await expect(
      wikidataConnector.fetchPage({
        configuration,
        checkpoint: null,
        pageSize: 10,
        context: context(htmlFetch),
      }),
    ).rejects.toMatchObject({ code: 'SOURCE_CONTENT_TYPE' });
    const malformedFetch: typeof fetch = () =>
      Promise.resolve(new Response('{', { headers: { 'content-type': 'application/json' } }));
    await expect(
      wikidataConnector.fetchPage({
        configuration,
        checkpoint: null,
        pageSize: 10,
        context: context(malformedFetch),
      }),
    ).rejects.toMatchObject({ code: 'SOURCE_MALFORMED_RESPONSE' });
  });

  it('retries 429 responses, respects Retry-After, and does not retry a permanent 400', async () => {
    const sleep = vi.fn(() => Promise.resolve());
    let attempts = 0;
    const retryFetch: typeof fetch = () => {
      attempts += 1;
      return Promise.resolve(
        attempts === 1
          ? new Response('', { status: 429, headers: { 'retry-after': '2' } })
          : new Response(JSON.stringify(wikidataFixture), {
              headers: { 'content-type': 'application/json' },
            }),
      );
    };
    const page = await wikidataConnector.fetchPage({
      configuration,
      checkpoint: null,
      pageSize: 10,
      context: { ...context(retryFetch), sleep },
    });
    expect(page.retryCount).toBe(1);
    expect(sleep).toHaveBeenCalledWith(2000, undefined);

    const permanentFetch = vi.fn<typeof fetch>(() =>
      Promise.resolve(new Response('', { status: 400 })),
    );
    await expect(
      wikidataConnector.fetchPage({
        configuration,
        checkpoint: null,
        pageSize: 10,
        context: context(permanentFetch),
      }),
    ).rejects.toMatchObject({ code: 'SOURCE_RESPONSE_REJECTED' });
    expect(permanentFetch).toHaveBeenCalledOnce();
  });

  it('bounds timeouts and propagates an explicit abort', async () => {
    const blockedFetch: typeof fetch = (request) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = request instanceof Request ? request.signal : undefined;
        if (signal?.aborted) {
          reject(new DOMException('Aborted', 'AbortError'));
          return;
        }
        signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), {
          once: true,
        });
      });
    await expect(
      wikidataConnector.fetchPage({
        configuration: { ...configuration, timeoutMs: 100, retryCount: 0 },
        checkpoint: null,
        pageSize: 10,
        context: context(blockedFetch),
      }),
    ).rejects.toMatchObject({ code: 'SOURCE_TIMEOUT' });

    const controller = new AbortController();
    controller.abort();
    await expect(
      wikidataConnector.fetchPage({
        configuration,
        checkpoint: null,
        pageSize: 10,
        context: { ...context(blockedFetch), signal: controller.signal },
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });
});
