import type { z } from 'zod';

import type { CreatorProtectionTier } from '@open-creator-registry/contracts/domain';

import {
  creatorAliasesResponseSchema,
  creatorDetailResponseSchema,
  creatorHandlesResponseSchema,
  creatorListResponseSchema,
  errorEnvelopeSchema,
  handleCheckResponseSchema,
  registryMetaResponseSchema,
  registryReleasesResponseSchema,
  submissionResponseSchema,
} from './schemas';

const publicApiBasePath = '/api/v1';

export type ValidationDetail = {
  code: string;
  message: string;
  path: string;
};

export class PublicApiError extends Error {
  readonly code: string;
  readonly details: ValidationDetail[];
  readonly requestId: string | null;
  readonly status: number;

  constructor(input: {
    code: string;
    details?: ValidationDetail[];
    message: string;
    requestId?: string | null;
    status: number;
  }) {
    super(input.message);
    this.name = 'PublicApiError';
    this.code = input.code;
    this.details = input.details ?? [];
    this.requestId = input.requestId ?? null;
    this.status = input.status;
  }
}

type RequestOptions = {
  body?: unknown;
  method?: 'GET' | 'POST';
  signal?: AbortSignal;
};

async function readResponseBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get('Content-Type') ?? '';
  if (!contentType.toLowerCase().includes('application/json')) {
    const text = await response.text();
    throw new PublicApiError({
      code: 'unexpected_response',
      message: text
        ? 'The Registry returned an unexpected non-JSON response.'
        : 'The Registry returned an empty response.',
      requestId: response.headers.get('X-Request-ID'),
      status: response.status,
    });
  }
  try {
    return await response.json();
  } catch {
    throw new PublicApiError({
      code: 'unexpected_response',
      message: 'The Registry returned JSON that could not be read.',
      requestId: response.headers.get('X-Request-ID'),
      status: response.status,
    });
  }
}

async function request<TSchema extends z.ZodType>(
  path: string,
  schema: TSchema,
  options: RequestOptions = {},
): Promise<z.infer<TSchema>> {
  let response: Response;
  try {
    response = await fetch(path, {
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      headers: {
        Accept: 'application/json',
        ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      method: options.method ?? 'GET',
      signal: options.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new PublicApiError({
      code: 'network_error',
      message: 'The Registry could not be reached. Check your connection and try again.',
      status: 0,
    });
  }

  const payload = await readResponseBody(response);
  if (!response.ok) {
    const parsedError = errorEnvelopeSchema.safeParse(payload);
    if (parsedError.success) {
      throw new PublicApiError({
        code: parsedError.data.error.code,
        details: parsedError.data.error.details,
        message: parsedError.data.error.message,
        requestId: parsedError.data.meta.request_id,
        status: response.status,
      });
    }
    throw new PublicApiError({
      code: 'unexpected_response',
      message: `The Registry request failed with HTTP ${response.status}.`,
      requestId: response.headers.get('X-Request-ID'),
      status: response.status,
    });
  }

  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new PublicApiError({
      code: 'unexpected_response',
      message: 'The Registry returned data in an unexpected format.',
      requestId: response.headers.get('X-Request-ID'),
      status: response.status,
    });
  }
  return parsed.data;
}

export type CreatorQuery = {
  category?: string;
  country?: string;
  limit?: number;
  order?: 'asc' | 'desc';
  page?: number;
  protectionTier?: CreatorProtectionTier;
  query?: string;
  sort?: 'canonical_name' | 'created_at' | 'notoriety_score' | 'updated_at';
};

function createQueryString(values: Record<string, string | number | undefined>) {
  const query = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (value !== undefined && value !== '') query.set(key, String(value));
  });
  const encoded = query.toString();
  return encoded ? `?${encoded}` : '';
}

export type SubmissionInput = {
  category?: string | null;
  country_codes?: string[] | null;
  creator_name: string;
  public_sources: string[];
  requested_handles: string[];
};

export const publicApi = {
  checkHandle(handle: string, signal?: AbortSignal) {
    const query = createQueryString({ handle });
    return request(`${publicApiBasePath}/handles/check${query}`, handleCheckResponseSchema, {
      signal,
    });
  },
  getCreator(creatorId: string, signal?: AbortSignal) {
    return request(
      `${publicApiBasePath}/creators/${encodeURIComponent(creatorId)}`,
      creatorDetailResponseSchema,
      { signal },
    );
  },
  listCreatorAliases(creatorId: string, signal?: AbortSignal) {
    return request(
      `${publicApiBasePath}/creators/${encodeURIComponent(creatorId)}/aliases?limit=100`,
      creatorAliasesResponseSchema,
      { signal },
    );
  },
  listCreatorHandles(creatorId: string, signal?: AbortSignal) {
    return request(
      `${publicApiBasePath}/creators/${encodeURIComponent(creatorId)}/handles?limit=100`,
      creatorHandlesResponseSchema,
      { signal },
    );
  },
  listCreators(values: CreatorQuery, signal?: AbortSignal) {
    const query = createQueryString({
      category: values.category,
      country: values.country,
      limit: values.limit ?? 10,
      order: values.order ?? 'asc',
      page: values.page ?? 1,
      protection_tier: values.protectionTier,
      query: values.query,
      sort: values.sort ?? 'canonical_name',
    });
    return request(`${publicApiBasePath}/creators${query}`, creatorListResponseSchema, { signal });
  },
  getRegistryMeta(signal?: AbortSignal) {
    return request(`${publicApiBasePath}/registry/meta`, registryMetaResponseSchema, { signal });
  },
  listReleases(page = 1, signal?: AbortSignal) {
    return request(
      `${publicApiBasePath}/registry/releases?page=${page}&limit=10`,
      registryReleasesResponseSchema,
      { signal },
    );
  },
  submitCreator(input: SubmissionInput, signal?: AbortSignal) {
    return request(`${publicApiBasePath}/submissions`, submissionResponseSchema, {
      body: input,
      method: 'POST',
      signal,
    });
  },
};

export type ApiTesterEndpoint = 'creators' | 'handle' | 'health' | 'meta';

export async function runApiTest(
  endpoint: ApiTesterEndpoint,
  parameters: { handle?: string; query?: string },
  signal?: AbortSignal,
) {
  const paths: Record<ApiTesterEndpoint, string> = {
    creators: `${publicApiBasePath}/creators${createQueryString({ limit: 5, query: parameters.query })}`,
    handle: `${publicApiBasePath}/handles/check${createQueryString({ handle: parameters.handle })}`,
    health: `${publicApiBasePath}/health`,
    meta: `${publicApiBasePath}/registry/meta`,
  };
  const requestUrl = paths[endpoint];
  let response: Response;
  try {
    response = await fetch(requestUrl, { headers: { Accept: 'application/json' }, signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new PublicApiError({
      code: 'network_error',
      message: 'The Registry could not be reached. Check your connection and try again.',
      status: 0,
    });
  }
  const body = await readResponseBody(response);
  return {
    body,
    cacheControl: response.headers.get('Cache-Control'),
    requestId: response.headers.get('X-Request-ID'),
    requestUrl,
    status: response.status,
  };
}
