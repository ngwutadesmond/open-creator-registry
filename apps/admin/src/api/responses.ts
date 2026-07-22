import type { Context } from 'hono';

import type { AdminAppEnv } from './app-env';

export type AdminApiErrorCode =
  | 'authentication_required'
  | 'authentication_unavailable'
  | 'authorization_denied'
  | 'bad_request'
  | 'conflict'
  | 'database_unavailable'
  | 'internal_error'
  | 'method_not_allowed'
  | 'not_found'
  | 'rate_limited'
  | 'rate_limit_unavailable'
  | 'request_too_large'
  | 'unsupported_media_type'
  | 'validation_failed';

export type ValidationDetail = { code: string; message: string; path: string };

export function responseMeta(context: Context<AdminAppEnv>) {
  return {
    request_id: context.get('requestId'),
    timestamp: context.get('requestTimestamp'),
  };
}

export function successEnvelope<T>(context: Context<AdminAppEnv>, data: T) {
  return { data, meta: responseMeta(context) };
}

export function errorEnvelope(
  context: Context<AdminAppEnv>,
  code: AdminApiErrorCode,
  message: string,
  details: ValidationDetail[] = [],
) {
  return { error: { code, message, details }, meta: responseMeta(context) };
}

export function paginationMeta(page: number, limit: number, total: number) {
  const totalPages = total === 0 ? 0 : Math.ceil(total / limit);
  return {
    page,
    limit,
    total,
    total_pages: totalPages,
    has_next_page: page < totalPages,
    has_previous_page: page > 1 && totalPages > 0,
  };
}
