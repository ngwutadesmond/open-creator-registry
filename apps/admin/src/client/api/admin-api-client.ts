import { z } from 'zod';

import { errorEnvelopeSchema } from './schemas';

export class AdminApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly requestId?: string;
  readonly details: Array<{ code: string; message: string; path: string }>;

  constructor(input: {
    code: string;
    message: string;
    status: number;
    requestId?: string;
    details?: Array<{ code: string; message: string; path: string }>;
  }) {
    super(input.message);
    this.name = 'AdminApiError';
    this.code = input.code;
    this.status = input.status;
    this.requestId = input.requestId;
    this.details = input.details ?? [];
  }
}

async function parseResponse<T>(response: Response, schema: z.ZodType<T>): Promise<T> {
  const requestId = response.headers.get('X-Request-ID') ?? undefined;
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new AdminApiError({
      code: 'invalid_response',
      message: 'The administration API returned a non-JSON response.',
      status: response.status,
      requestId,
    });
  }
  if (!response.ok) {
    const parsed = errorEnvelopeSchema.safeParse(payload);
    throw new AdminApiError({
      code: parsed.success ? parsed.data.error.code : 'request_failed',
      message: parsed.success ? parsed.data.error.message : 'The administration request failed.',
      status: response.status,
      requestId: parsed.success ? (parsed.data.meta?.request_id ?? requestId) : requestId,
      details: parsed.success ? parsed.data.error.details : [],
    });
  }
  const parsed = schema.safeParse(payload);
  if (!parsed.success)
    throw new AdminApiError({
      code: 'invalid_response',
      message: 'The administration API response did not match its expected contract.',
      status: response.status,
      requestId,
    });
  return parsed.data;
}

async function request<T>(
  path: string,
  schema: z.ZodType<T>,
  options: {
    method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
    body?: unknown;
    signal?: AbortSignal;
  } = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: options.method ?? 'GET',
      credentials: 'same-origin',
      headers:
        options.body === undefined
          ? { Accept: 'application/json' }
          : { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new AdminApiError({
      code: 'network_error',
      message: 'The administration API could not be reached.',
      status: 0,
    });
  }
  if (options.method === 'DELETE' && response.status === 204) return undefined as T;
  return parseResponse(response, schema);
}

export const adminApi = {
  get: <T>(path: string, schema: z.ZodType<T>, signal?: AbortSignal) =>
    request(path, schema, { signal }),
  post: <T>(path: string, body: unknown, schema: z.ZodType<T>, signal?: AbortSignal) =>
    request(path, schema, { method: 'POST', body, signal }),
  patch: <T>(path: string, body: unknown, schema: z.ZodType<T>, signal?: AbortSignal) =>
    request(path, schema, { method: 'PATCH', body, signal }),
  delete: (path: string, signal?: AbortSignal) =>
    request(path, z.undefined(), { method: 'DELETE', signal }),
};
