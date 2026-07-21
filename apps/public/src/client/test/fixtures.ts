import type { RegistryClassification } from '@open-creator-registry/contracts/classifications';
import type { HandleMatchType } from '@open-creator-registry/contracts/domain';

import type {
  HandleCheckResponse,
  PublicAlias,
  PublicCreator,
  PublicCreatorDetail,
  PublicHandle,
  RegistryMetaResponse,
} from '../api/schemas';

export const requestMeta = {
  request_id: '00000000-0000-4000-8000-000000000001',
  timestamp: '2026-07-21T12:00:00.000Z',
};

export const creator: PublicCreator = {
  id: '00000000-0000-4000-8000-000000000101',
  canonical_name: 'Demo Aurora Vale',
  entity_type: 'person',
  primary_category: 'music',
  country_codes: ['NG'],
  biography_summary: 'A clearly labelled fictional musician used for local development.',
  notoriety_score: 98,
  protection_tier: 'critical',
  created_at: '2026-07-20T10:00:00.000Z',
  updated_at: '2026-07-21T10:00:00.000Z',
};

export const alias: PublicAlias = {
  id: '00000000-0000-4000-8000-000000000201',
  alias: 'Aurora Vale',
  normalized_alias: 'aurora vale',
  language: 'en',
  alias_type: 'stage_name',
  confidence_score: 95,
};

export const handle: PublicHandle = {
  id: '00000000-0000-4000-8000-000000000301',
  display_handle: '@demo_aurora_vale',
  normalized_handle: 'demo_aurora_vale',
  classification: 'hard_reserved',
  confidence_score: 99,
  status: 'active',
  reason_summary: 'Demonstration exact creator handle.',
  created_at: '2026-07-20T10:00:00.000Z',
  updated_at: '2026-07-21T10:00:00.000Z',
};

export const creatorDetail: PublicCreatorDetail = {
  ...creator,
  aliases: [alias],
  handles: [handle],
  sources: [
    {
      id: '00000000-0000-4000-8000-000000000401',
      source_name: 'demonstration_catalogue',
      source_entity_id: 'demo-aurora-vale',
      source_url: 'https://example.com/demo-aurora-vale',
      source_license: 'CC0-1.0',
      last_checked_at: '2026-07-21T10:00:00.000Z',
    },
  ],
  external_profiles: [
    {
      platform: 'youtube',
      account_id: 'UCDEMOAURORAVALE',
      handle: 'DemoAuroraVale',
      profile_name: 'Demo Aurora Vale',
      url: 'https://www.youtube.com/@DemoAuroraVale',
      verification_status: 'source_linked',
      is_primary: true,
      last_verified_at: '2026-01-15T00:00:00.000Z',
    },
  ],
};

export const pagination = {
  page: 1,
  limit: 10,
  total: 1,
  total_pages: 1,
  has_next_page: false,
  has_previous_page: false,
};

export const registryMeta: RegistryMetaResponse = {
  data: {
    name: 'Open Creator Registry',
    description: 'Public creator protection decisions.',
    api_version: 'v1',
    current_registry_version: null,
    record_counts: { approved_creators: 10, active_reserved_handles: 12 },
    last_published_at: null,
    last_updated_at: '2026-07-21T10:00:00.000Z',
    data_policy_url: '/about#data-source-policy',
    disclaimer: 'Registry status is not username availability.',
    source_policy_summary: 'Public, attributable, reviewable sources only.',
    demonstration_data: true,
  },
  meta: requestMeta,
};

const actions: Record<RegistryClassification, HandleCheckResponse['data']['recommended_action']> = {
  hard_reserved: 'deny_and_offer_claim',
  soft_protected: 'require_claim_or_review',
  monitored: 'allow_with_impersonation_monitoring',
  not_listed: 'perform_platform_availability_check',
};

export function handleCheckResponse(
  classification: RegistryClassification,
  matchedBy: HandleMatchType,
  options: { ambiguous?: boolean; creator?: PublicCreator | null } = {},
): HandleCheckResponse {
  return {
    data: {
      input: classification === 'not_listed' ? 'ordinary_name' : 'demo_aurora_vale',
      normalized_handle: classification === 'not_listed' ? 'ordinary_name' : 'demo_aurora_vale',
      registry_status: classification,
      recommended_action: actions[classification],
      claim_allowed: classification === 'hard_reserved' || classification === 'soft_protected',
      registration_may_continue: true,
      matched_by: matchedBy,
      confidence_score: classification === 'not_listed' ? 0 : 96,
      ambiguous: options.ambiguous ?? false,
      creator:
        options.creator === undefined
          ? classification === 'not_listed'
            ? null
            : creator
          : options.creator,
      reservation_status: classification === 'not_listed' ? null : 'active',
      registry_version: null,
      registry_last_updated_at: '2026-07-21T10:00:00.000Z',
    },
    meta: requestMeta,
  };
}

export function jsonResponse(body: unknown, status = 200, headers: HeadersInit = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'X-Request-ID': requestMeta.request_id,
      ...headers,
    },
  });
}

export function errorResponse(
  status: number,
  code: string,
  message: string,
  details: { code: string; message: string; path: string }[] = [],
) {
  return jsonResponse(
    {
      error: { code, message, details },
      meta: requestMeta,
    },
    status,
  );
}
