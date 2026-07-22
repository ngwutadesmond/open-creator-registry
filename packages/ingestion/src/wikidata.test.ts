import { afterEach, describe, expect, it, vi } from 'vitest';

import type { SourceConfiguration } from '@open-creator-registry/database/models';

import { createWikidataFixtureFetch, wikidataFixture } from './fixtures';
import { defaultConnectorContext } from './contracts';
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
    ...defaultConnectorContext,
    fetch: fetchImplementation,
    now: () => '2026-07-21T00:00:00.000Z',
    sleep: vi.fn(() => Promise.resolve()),
    random: () => 0,
  };
}

function createBlockedFetch() {
  const signals: AbortSignal[] = [];
  const fetchImplementation = vi.fn<typeof fetch>(
    (request) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = request instanceof Request ? request.signal : undefined;
        if (!signal) {
          reject(new Error('Expected an abortable Request.'));
          return;
        }
        signals.push(signal);
        const rejectAbort = () =>
          reject(
            signal.reason instanceof Error
              ? signal.reason
              : new DOMException('The operation was aborted.', 'AbortError'),
          );
        if (signal.aborted) rejectAbort();
        else signal.addEventListener('abort', rejectAbort, { once: true });
      }),
  );
  return { fetchImplementation, signals };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

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

  it('aborts a blocked request at the configured timeout without using wall-clock time', async () => {
    vi.useFakeTimers();
    const blocked = createBlockedFetch();
    const request = wikidataConnector.fetchPage({
      configuration: { ...configuration, timeoutMs: 100, retryCount: 0 },
      checkpoint: null,
      pageSize: 10,
      context: context(blocked.fetchImplementation),
    });
    const rejection = expect(request).rejects.toMatchObject({
      name: 'IngestionError',
      code: 'SOURCE_TIMEOUT',
      message: 'The source request timed out.',
    });

    expect(blocked.fetchImplementation).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(100);
    await rejection;

    expect(blocked.signals).toHaveLength(1);
    expect(blocked.signals[0]).toMatchObject({ aborted: true });
    expect(blocked.signals[0]?.reason).toMatchObject({ name: 'TimeoutError' });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('propagates caller cancellation, removes its listener, and does not retry', async () => {
    vi.useFakeTimers();
    const blocked = createBlockedFetch();
    const controller = new AbortController();
    const addEventListener = vi.spyOn(controller.signal, 'addEventListener');
    const removeEventListener = vi.spyOn(controller.signal, 'removeEventListener');
    const request = wikidataConnector.fetchPage({
      configuration: { ...configuration, retryCount: 2 },
      checkpoint: null,
      pageSize: 10,
      context: { ...context(blocked.fetchImplementation), signal: controller.signal },
    });
    const rejection = expect(request).rejects.toMatchObject({ name: 'AbortError' });

    expect(blocked.fetchImplementation).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(1);
    controller.abort();
    await rejection;

    expect(blocked.fetchImplementation).toHaveBeenCalledOnce();
    expect(addEventListener).toHaveBeenCalledWith('abort', expect.any(Function), { once: true });
    expect(removeEventListener).toHaveBeenCalledWith('abort', expect.any(Function));
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cancels request timeouts and abort listeners after success and fetch errors', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const addEventListener = vi.spyOn(controller.signal, 'addEventListener');
    const removeEventListener = vi.spyOn(controller.signal, 'removeEventListener');
    await wikidataConnector.fetchPage({
      configuration,
      checkpoint: null,
      pageSize: 10,
      context: { ...context(), signal: controller.signal },
    });
    expect(addEventListener).toHaveBeenCalledWith('abort', expect.any(Function), { once: true });
    expect(removeEventListener).toHaveBeenCalledWith('abort', expect.any(Function));
    expect(vi.getTimerCount()).toBe(0);

    const failedFetch = vi.fn<typeof fetch>(() => Promise.reject(new TypeError('network failure')));
    await expect(
      wikidataConnector.fetchPage({
        configuration: { ...configuration, retryCount: 0 },
        checkpoint: null,
        pageSize: 10,
        context: context(failedFetch),
      }),
    ).rejects.toMatchObject({ code: 'SOURCE_NETWORK_ERROR' });
    expect(failedFetch).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
});
