import { normalizeCreatorName } from '@open-creator-registry/normalization';
import { normalizeExternalProfileUrl } from '@open-creator-registry/normalization/external-profiles';
import { z } from 'zod';

import type {
  MappedCreatorCandidate,
  MappedExternalProfile,
  SourceConnector,
  SourceConnectorContext,
  SourcePage,
} from './contracts';
import { IngestionError } from './contracts';

const WIKIDATA_ENDPOINT = 'https://query.wikidata.org/sparql';
const CONNECTOR_VERSION = '0.1.0-poc';
const MAPPING_VERSION = '2026-07-21';
const MAX_RESPONSE_BYTES = 1_000_000;
const qidSchema = z.string().regex(/^Q[1-9]\d*$/u);

export const wikidataScopeSchema = z.object({
  occupation_ids: z.array(qidSchema).min(1).max(25),
  country_ids: z.array(qidSchema).max(25).default([]),
  maximum_failed_records: z.int().min(0).max(20).default(3),
});

const bindingValueSchema = z.object({
  type: z.enum(['uri', 'literal', 'typed-literal', 'bnode']),
  value: z.string().max(10_000),
  'xml:lang': z.string().optional(),
  datatype: z.string().optional(),
});
const wikidataBindingSchema = z.record(z.string(), bindingValueSchema);
const wikidataResponseSchema = z.object({
  head: z.object({ vars: z.array(z.string()) }),
  results: z.object({ bindings: z.array(wikidataBindingSchema).max(500) }),
});

function valuesClause(variable: string, values: string[]): string {
  return `VALUES ?${variable} { ${values.map((value) => `wd:${qidSchema.parse(value)}`).join(' ')} }`;
}

export function buildWikidataQuery(input: {
  occupationIds: string[];
  countryIds: string[];
  limit: number;
  offset: number;
}): string {
  const occupations = input.occupationIds.map((value) => qidSchema.parse(value));
  const countries = input.countryIds.map((value) => qidSchema.parse(value));
  const limit = z.int().min(1).max(100).parse(input.limit);
  const offset = z.int().min(0).max(1_000_000).parse(input.offset);
  const countryFilter =
    countries.length > 0
      ? `${valuesClause('allowedCountry', countries)}\n  ?item wdt:P27 ?allowedCountry.`
      : '';

  return `SELECT ?item ?itemLabel ?itemDescription
    (GROUP_CONCAT(DISTINCT ?alias; separator="|") AS ?aliases)
    (GROUP_CONCAT(DISTINCT REPLACE(STR(?occupation), ".*/", ""); separator="|") AS ?occupations)
    (GROUP_CONCAT(DISTINCT REPLACE(STR(?country), ".*/", ""); separator="|") AS ?countries)
    ?officialWebsite ?musicBrainzId ?youtubeId ?spotifyId ?tiktokHandle ?instagramHandle
    ?xHandle ?facebookId ?twitchHandle ?soundcloudHandle ?appleMusicId
  WHERE {
    ${valuesClause('allowedOccupation', occupations)}
    ?item wdt:P106 ?allowedOccupation.
    OPTIONAL { ?item wdt:P106 ?occupation. }
    OPTIONAL { ?item wdt:P27 ?country. }
    ${countryFilter}
    OPTIONAL { ?item skos:altLabel ?alias FILTER(LANG(?alias) = "en") }
    OPTIONAL { ?item wdt:P856 ?officialWebsite. }
    OPTIONAL { ?item wdt:P434 ?musicBrainzId. }
    OPTIONAL { ?item wdt:P2397 ?youtubeId. }
    OPTIONAL { ?item wdt:P1902 ?spotifyId. }
    OPTIONAL { ?item wdt:P7085 ?tiktokHandle. }
    OPTIONAL { ?item wdt:P2003 ?instagramHandle. }
    OPTIONAL { ?item wdt:P2002 ?xHandle. }
    OPTIONAL { ?item wdt:P2013 ?facebookId. }
    OPTIONAL { ?item wdt:P5797 ?twitchHandle. }
    OPTIONAL { ?item wdt:P3040 ?soundcloudHandle. }
    OPTIONAL { ?item wdt:P2850 ?appleMusicId. }
    SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
  }
  GROUP BY ?item ?itemLabel ?itemDescription ?officialWebsite ?musicBrainzId ?youtubeId ?spotifyId
    ?tiktokHandle ?instagramHandle ?xHandle ?facebookId ?twitchHandle ?soundcloudHandle ?appleMusicId
  ORDER BY ASC(?item)
  LIMIT ${limit}
  OFFSET ${offset}`;
}

function splitValues(value: string | undefined): string[] {
  return value
    ? [
        ...new Set(
          value
            .split('|')
            .map((item) => item.trim())
            .filter(Boolean),
        ),
      ]
    : [];
}

function profile(
  platform: MappedExternalProfile['platform'],
  locator: { id?: string; handle?: string; url: string },
): MappedExternalProfile | null {
  try {
    const url = normalizeExternalProfileUrl(platform, locator.url);
    return url
      ? {
          platform,
          ...(locator.id ? { platformAccountId: locator.id } : {}),
          ...(locator.handle ? { platformHandle: locator.handle } : {}),
          profileUrl: url,
        }
      : null;
  } catch {
    return null;
  }
}

function mapProfiles(binding: Record<string, { value: string }>): MappedExternalProfile[] {
  const profiles: Array<MappedExternalProfile | null> = [];
  const website = binding.officialWebsite?.value;
  if (website) profiles.push(profile('official_website', { url: website }));
  const youtube = binding.youtubeId?.value;
  if (youtube)
    profiles.push(
      profile('youtube', { id: youtube, url: `https://www.youtube.com/channel/${youtube}` }),
    );
  const spotify = binding.spotifyId?.value;
  if (spotify)
    profiles.push(
      profile('spotify', { id: spotify, url: `https://open.spotify.com/artist/${spotify}` }),
    );
  const handlePlatforms = [
    ['tiktok', 'tiktokHandle', 'https://www.tiktok.com/@'],
    ['instagram', 'instagramHandle', 'https://www.instagram.com/'],
    ['x', 'xHandle', 'https://x.com/'],
    ['twitch', 'twitchHandle', 'https://www.twitch.tv/'],
    ['soundcloud', 'soundcloudHandle', 'https://soundcloud.com/'],
  ] as const;
  for (const [platformName, field, base] of handlePlatforms) {
    const handle = binding[field]?.value?.replace(/^@+/u, '');
    if (handle) profiles.push(profile(platformName, { handle, url: `${base}${handle}` }));
  }
  const facebook = binding.facebookId?.value;
  if (facebook)
    profiles.push(
      profile('facebook', { id: facebook, url: `https://www.facebook.com/${facebook}` }),
    );
  const appleMusic = binding.appleMusicId?.value;
  if (appleMusic)
    profiles.push(
      profile('apple_music', {
        id: appleMusic,
        url: `https://music.apple.com/artist/${appleMusic}`,
      }),
    );
  return profiles.filter((value): value is MappedExternalProfile => value !== null);
}

async function checksum(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function parseRetryAfter(value: string | null, now: string): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - Date.parse(now)) : null;
}

async function fetchWithRetry(input: {
  request: Request;
  context: SourceConnectorContext;
  timeoutMs: number;
  retryCount: number;
}): Promise<{ response: Response; retryCount: number }> {
  let retries = 0;
  for (;;) {
    const requestController = new AbortController();
    const callerSignal = input.context.signal;
    let timedOut = false;
    const abortFromCaller = () =>
      requestController.abort(
        callerSignal?.reason ?? new DOMException('The operation was aborted.', 'AbortError'),
      );
    if (callerSignal?.aborted) abortFromCaller();
    else callerSignal?.addEventListener('abort', abortFromCaller, { once: true });
    const cancelTimeout = input.context.scheduleTimeout(() => {
      timedOut = true;
      requestController.abort(new DOMException('The source request timed out.', 'TimeoutError'));
    }, input.timeoutMs);

    let outcome: { response: Response } | { error: unknown };
    try {
      outcome = {
        response: await input.context.fetch(
          new Request(input.request, { signal: requestController.signal }),
        ),
      };
    } catch (error) {
      outcome = { error };
    } finally {
      cancelTimeout();
      callerSignal?.removeEventListener('abort', abortFromCaller);
    }

    if ('error' in outcome) {
      if (callerSignal?.aborted && !timedOut) throw outcome.error;
      if (timedOut) {
        if (retries >= input.retryCount) {
          throw new IngestionError('SOURCE_TIMEOUT', 'The source request timed out.', true);
        }
        retries += 1;
        await input.context.sleep(Math.min(5000, 250 * 2 ** (retries - 1)), callerSignal);
        continue;
      }
      if (retries >= input.retryCount) {
        throw new IngestionError('SOURCE_NETWORK_ERROR', 'The source request failed.', true);
      }
      const delay = Math.min(5000, 250 * 2 ** retries) + Math.floor(input.context.random() * 100);
      retries += 1;
      await input.context.sleep(delay, callerSignal);
      continue;
    }

    const { response } = outcome;
    const retryable = response.status === 429 || response.status >= 500;
    if (!retryable || retries >= input.retryCount) return { response, retryCount: retries };
    const retryAfter = parseRetryAfter(response.headers.get('retry-after'), input.context.now());
    const exponential = Math.min(5000, 250 * 2 ** retries);
    const jitter = Math.floor(input.context.random() * 100);
    retries += 1;
    await input.context.sleep(retryAfter ?? exponential + jitter, callerSignal);
  }
}

export const wikidataConnector: SourceConnector = {
  sourceName: 'wikidata',
  connectorVersion: CONNECTOR_VERSION,
  mappingVersion: MAPPING_VERSION,
  accessMode: 'official_api',
  validateConfiguration(configuration) {
    if (!configuration.enabled) return { status: 'disabled', message: 'Wikidata is disabled.' };
    if (configuration.baseUrl !== WIKIDATA_ENDPOINT) {
      return {
        status: 'invalid_configuration',
        message: 'The Wikidata endpoint is not allowlisted.',
      };
    }
    if (configuration.connectorVersion !== CONNECTOR_VERSION) {
      return { status: 'invalid_configuration', message: 'The connector version does not match.' };
    }
    const scope = wikidataScopeSchema.safeParse(configuration.scopeConfiguration);
    if (!scope.success || configuration.configurationStatus !== 'valid') {
      return { status: 'invalid_configuration', message: 'The Wikidata scope is invalid.' };
    }
    return { status: 'ready', message: 'The bounded Wikidata connector is ready.' };
  },
  async fetchPage({ configuration, checkpoint, pageSize, context }): Promise<SourcePage> {
    const readiness = this.validateConfiguration(configuration);
    if (readiness.status !== 'ready')
      throw new IngestionError('CONNECTOR_NOT_READY', readiness.message);
    const scope = wikidataScopeSchema.parse(configuration.scopeConfiguration);
    const offset = checkpoint?.cursor ? z.coerce.number().int().min(0).parse(checkpoint.cursor) : 0;
    const limit = Math.min(pageSize, configuration.batchSize, 100);
    const query = buildWikidataQuery({
      occupationIds: scope.occupation_ids,
      countryIds: scope.country_ids,
      limit,
      offset,
    });
    const url = new URL(WIKIDATA_ENDPOINT);
    url.searchParams.set('query', query);
    url.searchParams.set('format', 'json');
    const { response, retryCount } = await fetchWithRetry({
      request: new Request(url, {
        headers: {
          accept: 'application/sparql-results+json, application/json',
          'user-agent':
            context.userAgent ??
            'OpenCreatorRegistry/0.1 (unconfigured-contact; connector disabled by default)',
        },
      }),
      context,
      timeoutMs: configuration.timeoutMs,
      retryCount: configuration.retryCount,
    });
    if (!response.ok) {
      throw new IngestionError(
        response.status >= 500 || response.status === 429
          ? 'SOURCE_TRANSIENT_RESPONSE'
          : 'SOURCE_RESPONSE_REJECTED',
        `The source returned HTTP ${response.status}.`,
        response.status >= 500 || response.status === 429,
      );
    }
    const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
    if (!contentType.includes('json')) {
      throw new IngestionError(
        'SOURCE_CONTENT_TYPE',
        'The source returned an unsupported content type.',
      );
    }
    const contentLength = Number(response.headers.get('content-length') ?? '0');
    if (contentLength > MAX_RESPONSE_BYTES) {
      throw new IngestionError(
        'SOURCE_RESPONSE_TOO_LARGE',
        'The source response exceeded the size limit.',
      );
    }
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > MAX_RESPONSE_BYTES) {
      throw new IngestionError(
        'SOURCE_RESPONSE_TOO_LARGE',
        'The source response exceeded the size limit.',
      );
    }
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      throw new IngestionError('SOURCE_MALFORMED_RESPONSE', 'The source returned malformed JSON.');
    }
    const parsed = wikidataResponseSchema.safeParse(raw);
    if (!parsed.success) {
      throw new IngestionError(
        'SOURCE_INVALID_RESPONSE',
        'The source response did not match the expected schema.',
      );
    }
    const records = parsed.data.results.bindings.map((binding) => {
      const id = binding.item?.value.match(/\/entity\/(Q[1-9]\d*)$/u)?.[1];
      return { sourceRecordId: id ?? 'invalid', value: binding };
    });
    return {
      records,
      nextCursor: records.length === limit ? String(offset + records.length) : null,
      complete: records.length < limit,
      retryCount,
    };
  },
  async mapRecord(record, context): Promise<MappedCreatorCandidate> {
    const parsed = wikidataBindingSchema.safeParse(record.value);
    if (!parsed.success || record.sourceRecordId === 'invalid') {
      throw new IngestionError('SOURCE_RECORD_INVALID', 'A source record was invalid.');
    }
    const binding = parsed.data;
    const canonicalName = binding.itemLabel?.value?.trim();
    if (!canonicalName) {
      throw new IngestionError(
        'SOURCE_RECORD_MISSING_NAME',
        'A source record had no usable label.',
      );
    }
    const aliases = splitValues(binding.aliases?.value).filter((alias) => alias !== canonicalName);
    const externalProfiles = mapProfiles(binding);
    if (binding.musicBrainzId?.value) {
      externalProfiles.push({
        platform: 'other',
        platformAccountId: binding.musicBrainzId.value,
        profileName: 'MusicBrainz artist ID',
      });
    }
    return {
      canonicalName,
      normalizedName: normalizeCreatorName(canonicalName),
      countryCodes: splitValues(binding.countries?.value).filter((value) =>
        /^[A-Z]{2}$/u.test(value),
      ),
      aliases,
      ...(binding.itemDescription?.value ? { description: binding.itemDescription.value } : {}),
      occupationIds: splitValues(binding.occupations?.value).filter(
        (value) => qidSchema.safeParse(value).success,
      ),
      externalProfiles,
      provenance: {
        sourceName: 'wikidata',
        sourceEntityId: record.sourceRecordId,
        sourceUrl: `https://www.wikidata.org/wiki/${record.sourceRecordId}`,
        sourceLicense: 'CC0-1.0',
        retrievedAt: context.now(),
        connectorVersion: CONNECTOR_VERSION,
        mappingVersion: MAPPING_VERSION,
      },
      rawRecordChecksum: await checksum(binding),
      warnings: [],
    };
  },
};
