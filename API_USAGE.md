# Public API usage

## Browser interface

The Phase 4 public application at `http://localhost:5173` uses this API through one typed,
Zod-validating client. Visitors can check a handle at `/check`, search reviewed records at
`/creators`, inspect releases at `/releases`, submit public evidence at `/submit`, and send an
allowlisted public GET from `/api-tester`. The browser interface does not add authentication or
change Registry semantics; consuming platforms should integrate with the versioned API directly.

The Open Creator Registry API classifies username-protection risk. It does not report username
availability, legal ownership, trademark rights, identity proof, or endorsement.

## Base URL and authentication

All Phase 3 endpoints are public and unauthenticated. Local development uses:

```text
http://localhost:5173
```

No production hostname exists yet. Gate A defines account-neutral Worker URL placeholders; the
OpenAPI server is derived from the configured environment or current request origin.

Every JSON response includes `meta.request_id` and `meta.timestamp`; the request ID is also returned
as `X-Request-ID`. A caller may send a UUID in `X-Request-ID` for correlation. Other values are
replaced with an application-generated UUID.

## Handle-check semantics

`GET /api/v1/handles/check?handle=...` normalizes the supplied handle and checks only local Registry
data. It never calls an external creator service. Match precedence is:

1. exact active `hard_reserved` handle;
2. exact active `soft_protected` handle;
3. exact active `monitored` handle;
4. verified official-handle alias;
5. verified protected-variant alias;
6. Unicode-confusable skeleton risk signal;
7. another verified alias;
8. `not_listed`.

Stronger classifications and match types win. If records point to multiple creator identities,
`ambiguous` is `true`, the conservative winning protection remains, and `creator` is suppressed.
A confusable or alias signal is evidence for review, never proof of identity.

Reservation status is conservative: `active` uses its stored classification; `suspended` and
`disputed` produce at least `soft_protected`; `released` is excluded while other aliases and active
records continue to be evaluated.

| `registry_status` | `recommended_action`                  | `claim_allowed` |
| ----------------- | ------------------------------------- | --------------- |
| `hard_reserved`   | `deny_and_offer_claim`                | `true`          |
| `soft_protected`  | `require_claim_or_review`             | `true`          |
| `monitored`       | `allow_with_impersonation_monitoring` | `true`          |
| `not_listed`      | `perform_platform_availability_check` | `false`         |

`registration_may_continue: true` means the consuming platform can continue account creation,
normally with a temporary username. It does not mean the requested username should be assigned.

```bash
curl --get 'http://localhost:5173/api/v1/handles/check' \
  --data-urlencode 'handle=@demo.aurora-vale'
```

A representative response shape is:

```json
{
  "data": {
    "input": "@demo.aurora-vale",
    "normalized_handle": "demo_aurora_vale",
    "registry_status": "hard_reserved",
    "recommended_action": "deny_and_offer_claim",
    "claim_allowed": true,
    "registration_may_continue": true,
    "matched_by": "exact_handle",
    "confidence_score": 100,
    "ambiguous": false,
    "creator": {
      "id": "10000000-0000-4000-8000-000000000001",
      "canonical_name": "Demo Aurora Vale",
      "entity_type": "person",
      "primary_category": "music",
      "country_codes": ["US"],
      "biography_summary": "Fictional critical-tier musician used only for local development.",
      "notoriety_score": 98,
      "protection_tier": "critical",
      "created_at": "2026-01-15T00:00:00.000Z",
      "updated_at": "2026-01-15T00:00:00.000Z"
    },
    "reservation_status": "active",
    "registry_version": null,
    "registry_last_updated_at": "2026-01-15T00:00:00.000Z"
  },
  "meta": {
    "request_id": "d09aeebd-c412-4e2b-98f2-c328b42c2093",
    "timestamp": "2026-07-21T16:00:00.000Z"
  }
}
```

The local demonstration seed has no published release, so `registry_version` is truthfully `null`.
Timestamps and request IDs vary. The actual complete schema is at `/openapi.json`.

## Batch checking

The batch endpoint accepts 1–50 handles, validates the entire body before querying, preserves input
order and duplicates, and returns registry metadata once. One invalid item rejects the complete
request with `422`.

```bash
curl 'http://localhost:5173/api/v1/handles/check-batch' \
  --header 'Content-Type: application/json' \
  --data '{"handles":["demo_aurora_vale","demo_aurora_vale_fans","ordinary_name"]}'
```

## Creator search and detail

Only approved creators are public. Search covers canonical names, verified aliases, active reserved
handles, and verified external source identifiers. Supported parameters are `query`, `category`,
`country`, `protection_tier`, `review_status=approved`, `source`, `page`, `limit`, `sort`, and
`order`. The default page is 1, default limit is 20, and maximum limit is 100. Sort is restricted to
`canonical_name`, `created_at`, `notoriety_score`, or `updated_at`; order is `asc` or `desc`.

```bash
curl --get 'http://localhost:5173/api/v1/creators' \
  --data-urlencode 'query=Aurora Vale' \
  --data-urlencode 'country=US' \
  --data-urlencode 'page=1' \
  --data-urlencode 'limit=20'

curl 'http://localhost:5173/api/v1/creators/10000000-0000-4000-8000-000000000001'
curl 'http://localhost:5173/api/v1/creators/10000000-0000-4000-8000-000000000001/handles'
curl 'http://localhost:5173/api/v1/creators/10000000-0000-4000-8000-000000000001/aliases'
```

Paginated responses include `page`, `limit`, `total`, `total_pages`, `has_next_page`, and
`has_previous_page`. Detail responses include at most 100 verified aliases and active handles in
their embedded summaries; use the paginated relationship endpoints for complete traversal. Handle
`reason_summary` is a policy-generated public explanation; the API never returns the stored internal
reservation reason. A stored `not_listed` record represents an absence classification, so it is
excluded from protected-handle relationships, creator search, and active-handle counts.

## Registry metadata and releases

```bash
curl 'http://localhost:5173/api/v1/registry/meta'
curl 'http://localhost:5173/api/v1/registry/releases?page=1&limit=20'
```

A release version identifies a published Registry decision point, not an API version. Before an
administrator publishes the first release, the current version is `null` and the public release
list is empty. Release history contains current and superseded published releases; draft and
withdrawn records are private. Local metadata explicitly marks the seed as demonstration data.

## Public submissions

Submissions create only a pending human-review record. They never approve a creator or reserve a
handle. The request is limited to 32 KiB, 10 handles, and 10 syntactically valid public source URLs.
Submitted URLs are stored but never fetched. Equivalent pending submissions return `409`; this is
the Phase 3 duplicate/idempotency policy.

```bash
curl 'http://localhost:5173/api/v1/submissions' \
  --header 'Content-Type: application/json' \
  --data '{
    "creator_name":"Demo Submission Person",
    "category":"music",
    "country_codes":["NG"],
    "requested_handles":["demo_submission_person"],
    "public_sources":["https://example.test/public-profile"]
  }'
```

The current privacy/schema policy does not collect submitter contact information or private notes.
Gate A declares per-environment Cloudflare rate-limit bindings for submissions and handle checks;
they are not active until deployment. Local development intentionally permits deterministic tests
without a remote binding.

## Errors

Failures never return `200` and never expose SQL messages or stack traces. Expected statuses are
`400` malformed JSON, `403` disallowed origin, `404` missing public resource, `409` duplicate,
`413` oversized request, `415` wrong content type, `422` invalid input, `429` configured rate limit,
`500` unexpected failure, and `503` database unavailability.

```json
{
  "error": {
    "code": "validation_failed",
    "message": "The request could not be processed.",
    "details": [{ "code": "custom", "message": "A handle is required.", "path": "handle" }]
  },
  "meta": {
    "request_id": "d09aeebd-c412-4e2b-98f2-c328b42c2093",
    "timestamp": "2026-07-21T16:00:00.000Z"
  }
}
```

Clients should branch on the HTTP status and stable `error.code`, retain the request ID for support,
and avoid parsing the human-readable message.

## Client examples

### TypeScript and Node fetch

The same example works in a modern Node.js process and a TypeScript web client:

```ts
const response = await fetch(
  'http://localhost:5173/api/v1/handles/check?handle=' + encodeURIComponent('@demo.aurora-vale'),
  { headers: { Accept: 'application/json' } },
);
const payload: unknown = await response.json();
if (!response.ok) throw new Error(`Registry request failed (${response.status})`);
console.log(payload);
```

### Dart

```dart
import 'dart:convert';
import 'package:http/http.dart' as http;

final uri = Uri.parse('http://localhost:5173/api/v1/handles/check')
    .replace(queryParameters: {'handle': '@demo.aurora-vale'});
final response = await http.get(uri, headers: {'Accept': 'application/json'});
final payload = jsonDecode(response.body) as Map<String, dynamic>;
if (response.statusCode != 200) {
  throw Exception('Registry request failed (${response.statusCode})');
}
print(payload['data']);
```

### PHP

```php
<?php
$url = 'http://localhost:5173/api/v1/handles/check?' . http_build_query([
    'handle' => '@demo.aurora-vale',
]);
$context = stream_context_create(['http' => ['ignore_errors' => true]]);
$body = file_get_contents($url, false, $context);
$payload = json_decode($body, true, flags: JSON_THROW_ON_ERROR);
if (!isset($payload['data'])) {
    throw new RuntimeException('Registry request failed');
}
```

### Laravel HTTP client

```php
use Illuminate\Support\Facades\Http;

$response = Http::acceptJson()
    ->timeout(3)
    ->get('http://localhost:5173/api/v1/handles/check', [
        'handle' => '@demo.aurora-vale',
    ]);

$response->throw();
$result = $response->json('data');
```

## Merchrix integration

1. Merchrix first checks its own users database for an existing username.
2. Merchrix calls `GET /api/v1/handles/check` and stores the result with its registry version and
   timestamp.
3. For `hard_reserved`, Merchrix does not assign the requested username, starts its own claim flow,
   lets the creator submit that claim during onboarding, generates a unique temporary Merchrix
   username, and continues registration.
4. For `soft_protected`, Merchrix does not assign automatically, requires its claim or review flow,
   generates a unique temporary username, and continues registration.
5. For `monitored`, Merchrix applies its impersonation-monitoring policy.
6. For `not_listed`, Merchrix performs its own availability check.
7. Merchrix caches recent Registry results conservatively and maintains a local fallback list for
   critical names.
8. A Registry timeout, `503`, invalid response, or stale cache must not automatically grant a
   suspicious username. Fall back to the local critical-name policy or manual review.
9. The Registry does not process Merchrix claims. Merchrix remains responsible for account
   creation, temporary usernames, claims, and final username assignment.

## External profiles

`GET /api/v1/creators/{creatorId}` includes `external_profiles`. The array can be empty. Entries are
public reviewed associations only and contain platform, optional account ID/handle/name/URL,
verification status, primary flag, and last-confirmed time. Source-linked associations are not
identity or account-control proof. Connector configuration and private provenance are never public.

## Caching and rate limits

Single-handle checks permit shared caching for 60 seconds with mandatory revalidation. Creator and
registry reads permit browser caching for 60 seconds and shared caching for 300 seconds. Health,
batch requests, submissions, and every non-GET response use `no-store`. These short lifetimes avoid
allowing a stale classification to outlive a newly published or disputed decision indefinitely.

Remote configurations declare route-specific Cloudflare rate-limit bindings, but no deployed limit
is asserted by Gate A. Consumers must handle `429`, respect `Retry-After`, and treat
`503 rate_limit_unavailable` as a fail-closed transient error.
