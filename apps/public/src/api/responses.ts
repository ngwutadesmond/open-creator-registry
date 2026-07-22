import type { Context } from 'hono';

import type { PublicAppEnv } from './app-env';

export type ApiErrorCode =
  | 'bad_request'
  | 'conflict'
  | 'cors_origin_forbidden'
  | 'database_unavailable'
  | 'internal_error'
  | 'method_not_allowed'
  | 'not_found'
  | 'rate_limited'
  | 'rate_limit_unavailable'
  | 'request_too_large'
  | 'unsupported_media_type'
  | 'validation_failed';

export type ValidationDetail = {
  code: string;
  message: string;
  path: string;
};

export function responseMeta(context: Context<PublicAppEnv>) {
  return {
    request_id: context.get('requestId'),
    timestamp: context.get('requestTimestamp'),
  };
}

export function successEnvelope<T>(context: Context<PublicAppEnv>, data: T) {
  return { data, meta: responseMeta(context) };
}

export function errorEnvelope(
  context: Context<PublicAppEnv>,
  code: ApiErrorCode,
  message: string,
  details: ValidationDetail[] = [],
) {
  return {
    error: { code, message, details },
    meta: responseMeta(context),
  };
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
