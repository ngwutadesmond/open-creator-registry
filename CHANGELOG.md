# Changelog

All notable changes to this project are documented here. The project follows semantic versioning
after its first public release.

## Unreleased

### Phase 7 Gate C public empty state fixed

- Replaced the stale local-demonstration and Phase 5 release placeholder with an
  environment-neutral empty state that truthfully describes an unpublished production Registry.

### Phase 7 Gate C preflight fixed

- Made approval creation, expiry checks, decisions, and application use the same request-scoped
  timestamp. This removes wall-clock drift from deterministic administration tests and prevents a
  request crossing a clock boundary from evaluating one approval against inconsistent timestamps.

### Phase 7 Gate B public profile endpoint fixed

- Added the documented public creator-profile endpoint with generated OpenAPI coverage, public-only
  visibility filtering, safe caching, method handling, and staging smoke verification after live
  Gate B testing found that the profile collection URL returned `404`.

### Phase 7 Gate B staging UI fixed

- Replaced hard-coded local-development identity and local-D1 claims with authentication-aware and
  environment-neutral administration labels so a Cloudflare Access staging session truthfully
  reports Worker-validated Access authentication and the bound environment database.
- Added frontend coverage proving remote Access identities never render the local-development
  authentication notice while preserving the explicit local-only warning in local development.

### Phase 7 Gate B validation fixed

- Split Cloudflare validation into account-neutral structural, public deployment, default-deny
  administration bootstrap, and complete administration final modes without weakening Worker/D1,
  rate-limit, assets, observability, Cron, Wikidata, or authentication checks.
- Materialize exactly one account-specific target/phase into an ignored mode-`0600` manifest;
  tracked Wrangler templates remain unchanged, and dry-run/real deployment select the same
  validated manifest and exact Worker/D1 boundary.
- Added 24 deterministic deployment-tooling tests and separate public/admin bootstrap/admin final
  commands. The manual workflow now deploys one typed target/phase per exact confirmation.

### Phase 7 Gate B staging fixed

- Corrected the D1 migration guard for Wrangler 4.112: Time Travel info is inherently remote and
  must not receive the migrations/execute-only `--remote` flag. Focused argument tests preserve the
  distinction before the staging migration is retried with operator approval.

### Phase 7 Gate A added

- Separate local, staging, and production Wrangler environments for public/admin Workers with
  isolated environment D1 boundaries, rate-limit bindings, asset bindings, empty Cron policies,
  and Workers observability configuration.
- Default-deny Cloudflare Access JWT verification with RS256 signature, issuer, audience, time,
  email allowlist, server-side role mapping, JWK caching/rotation, and deterministic ephemeral-key
  tests.
- Route-preserving cache fallback behavior, hardened CORS/security/CSP headers, self-hosted locked
  Scalar assets, production-like readiness health checks, redacted request/scheduled logs, and
  fail-closed remote abuse-protection boundaries.
- Guarded remote migration, configuration, build/deployment, staging seed, and smoke-test tooling;
  least-privilege manual CI deployment; Dependabot; and production-safe source defaults.
- Account-neutral staging, production, Access, secret, operations, observability, backup/recovery,
  rollback, incident, contribution, correction/dispute, and resource-manifest documentation.

### Phase 7 Gate A safety boundary

- Gate A performed no Wrangler authentication, Cloudflare provisioning, remote migration,
  deployment, secret creation, Access configuration, Cron creation, or external connector request.
  Gate B staging requires separate owner approval; production remains a later gate.

### Phase 7 Gate A fixed

- Replaced the Wikidata connector's opaque native timeout signal with an explicitly cancellable
  request timer and caller-abort forwarding that are cleaned up after every attempt. Deterministic
  fake-timer tests now cover bounded timeout errors, explicit cancellation without retry, and timer
  and listener cleanup after success and failure.

### Phase 7 Gate A verified

- A clean local reset applied all five migrations, produced 21 tables and 86 indexes with no
  foreign-key violations, and retained identical demonstration counts across two additional seed
  runs.
- Formatting, zero-warning ESLint, strict all-workspace TypeScript, generated Worker bindings,
  staging/production configuration validation, both OpenAPI documents, both production builds,
  bundle boundary/secret inspection, and the production dependency audit pass.
- The aggregate suite passes 162 tests: 59 unit, 23 frontend, 30 real D1, 31 public API, and 19
  administration API tests. Focused coverage additionally confirms 10 Cloudflare Access JWT cases,
  10 ingestion cases, the scheduled-handler scenario, and 14 Chromium workflows.
- Browser inspection covered 18 public/private surfaces at 1536×1024, 1280×800, 1024×768,
  768×1024, 390×844, and 320×844 (108 rendered checks) with no page-level overflow, render alert,
  console/request/CSP error, clipped control, or unlabelled application table scroller. The audit
  filter's native date input intrinsic-width overflow was corrected during this pass.
- Route cache policies now survive the generic fallback: health and all administration responses
  remain `no-store`, explicit public API cache policies are preserved, uncached GET/error routes
  receive `no-cache`, and CORS/preflight responses retain the full security-header policy.

### Phase 6 added

- Strongly typed source connector contracts, explicit future MusicBrainz/public-web boundaries,
  and a narrow Wikidata proof of concept using structured Q-ID scope, deterministic pagination,
  bounded responses/timeouts/retries, licence provenance, and offline fixtures.
- D1 source configurations, checkpoints, expiring owner-aware run leases, bounded record outcomes,
  candidate provenance, richer run counters, and idempotent source-entity candidate updates in
  migration `0004_scheduled_ingestion_and_profiles.sql`.
- An awaited Cloudflare scheduled handler and matching manual preview/run orchestration; connectors
  are disabled, scheduling-disabled, and dry-run by default, and no production Cron Trigger exists.
- Optional normalized creator profiles with host validation, global account/URL conflicts, public
  visibility policy, safe suppression, audit logging, and approval-gated critical redirects.
- Public profile display plus private source configuration, run/outcome/checkpoint, candidate
  provenance, and profile-management interfaces without exposing ingestion administration publicly.
- Offline connector/D1/API/frontend coverage and dedicated source/profile/ingestion policy and
  local-operation documentation.
- Atomic primary-profile reassignment so an explicit reviewed selection demotes the previous
  primary association for the same creator/platform without weakening global account/URL conflict
  checks.

### Phase 6 verified

- Clean application of all four migrations produced 21 tables and 86 indexes with no foreign-key
  violations; repeat demonstration seeding remained idempotent at 10 creators, 12 handles, two
  public external profiles, and one disabled source configuration.
- The complete gate passes 142 Vitest tests and 14 Chromium workflows, zero-warning ESLint, strict
  TypeScript, formatting checks, both production builds, and a production dependency audit with
  zero reported vulnerabilities.
- Desktop public creator detail, desktop admin ingestion, and 390px public explorer renders were
  inspected from live local Workers. The actual local Wrangler scheduled endpoint completed a
  fixture-backed scheduled run and persisted its bounded outcome.
- No live Wikidata call, remote D1 database, production Cron Trigger, Cloudflare login, deployment,
  handle reservation, protection-tier change, creator approval, or registry publication was
  performed by ingestion.

### Phase 5 added

- Default-deny administration authentication abstraction, deterministic server-configured local
  identities, centralized role/permission contracts, and route authorization.
- Private versioned Hono API and responsive React administration interface for dashboard metrics,
  creators, aliases, sources, reserved handles, candidates, submissions, imports, ingestion runs,
  releases, approvals, audit logs, and settings.
- Two-person, expiring, stale-safe critical handle and release approvals with guarded atomic D1
  application and replay/self-approval denial.
- JSON/CSV dry-run imports with shared normalization, duplicate/confusable/common-name signals,
  stored checksums, bounded commits, idempotency, summaries, and critical-change routing.
- Deterministic release snapshots, diffs, checksums, approval-gated publication, superseding, and
  withdrawal with clear demonstration-data semantics.
- Separate authenticated admin OpenAPI and Scalar reference, seven focused operations/security
  documents, real D1 admin integration coverage, frontend component tests, and five admin
  Playwright workflows within the 12-workflow browser suite.
- Migration `0003_registry_administration.sql`, bringing local D1 to 15 domain/workflow tables and
  58 indexes with no foreign-key violations.
- Post-build sanitization that removes Cloudflare's local-preview variable file and fails closed if
  a `.dev.vars*` file remains in either Worker artifact.
- Deterministic combined local startup that waits for the public Worker before starting the admin
  Worker, avoiding simultaneous Miniflare recovery against their shared local D1 state.

### Phase 5 verified

- Clean migrations, seed idempotency, zero-warning lint, strict TypeScript, public/admin API and D1
  tests, production builds, dependency audit, cross-Worker local D1 visibility, desktop/mobile
  render inspection, axe checks, deep links, and zero mobile overflow.
- The complete automated gate passes 116 Vitest tests and 12 real-browser Playwright workflows.
- No remote database, Cloudflare login, external connector, scheduled ingestion, or deployment was
  created. Cloudflare Access JWT verification remains an explicit Phase 7 prerequisite.

### Phase 5 hardened

- Redacted validated import records from `import.previewed` audit entries. Preview audits now retain
  only bounded counts, file metadata, status, and checksum while the private import batch remains
  the sole store for the validated commit payload.

### Phase 4 added

- Responsive public home, handle checker, creator explorer/detail, release history, public
  submission, API tester, about/policy, and unknown-route experiences using the real Phase 3 API.
- A centralized Zod-validating browser client with request-ID errors, abortable reads, URL-backed
  server-side filters/sorting/pagination, parallel creator evidence loading, and route lazy loading.
- Accessible loading, empty, success, validation, retry, ambiguous/confusable, and truthful
  unversioned/not-listed states with public-only desktop and mobile navigation.
- Twenty jsdom component tests and seven Playwright workflows against the real local Worker and
  seeded D1, including history, deep-link refresh, Scalar docs, submission count invariants,
  390/320px layouts, and the separate Phase 5 admin boundary.
- Public frontend and accessibility documentation, responsive visual-fidelity ledger, and exact
  local browser-test commands.

### Phase 4 hardened

- Fixed Strict Mode handle-check cancellation so a remounted direct route always starts a live
  replacement request and manual URL updates cannot restart the initial query.
- Removed a 320px header overflow while preserving the mobile menu's accessible name.
- Associated repeatable submission errors with their inputs and preserved failed submission data.
- Confirmed the public submission flow leaves approved-creator and active-reservation counts
  unchanged and that `not_listed` is never presented as availability.

### Phase 3 added

- Versioned public Hono endpoints for health, single and batch handle classification, approved
  creator search/detail/relationships, registry metadata/releases, and pending public submissions.
- Deterministic set-based matching with conservative released, suspended, disputed, confusable, and
  conflicting-identity policies and shared match-type contracts.
- Generated OpenAPI 3.1 output and an interactive Scalar reference at `/openapi.json` and `/docs`.
- Consistent request IDs, envelopes, pagination, strict CORS, request/content limits, security
  headers, conservative caching, safe error mapping/logging, and an injectable rate-limit boundary.
- Public API client, OpenAPI, and security documentation including the Merchrix onboarding/outage
  flow and curl, TypeScript/Node, Dart, PHP, and Laravel examples.
- Real D1-backed public Worker tests plus structural OpenAPI validation.

### Phase 3 hardened

- Proved D1 release-publication rollback with a deliberately failing statement and documented
  deterministic republish, missing-release, and near-concurrent publication behavior.
- Extended repository lookups for bounded public search, verified evidence, protection candidates,
  public releases, and duplicate pending submissions without exposing raw SQL to routes.
- Preserved the accepted public shell while activating its documentation link; the full explorer
  remains Phase 4 and administration remains a Phase 5 `501` boundary.
- Disabled Scalar telemetry, AI, and developer tools, added a request-specific CSP nonce, and fixed
  the route-specific font policy so the interactive reference renders without browser-console
  errors.
- Prevented unverified aliases and protection records attached to unapproved creators from crossing
  the public search/matching boundary.
- Replaced direct reservation-reason mapping with policy-generated public summaries so future
  internal review wording cannot leak through creator handle responses.
- Excluded explicit `not_listed` absence records from public protected-handle relationships,
  creator search, and active-handle counts.

### Phase 3 verified

- A clean local reset applied both migrations and produced nine domain tables, 41 indexes, no
  foreign-key violations, and idempotent 10-creator/10-source/11-alias/12-handle demonstration data.
- 36 unit/contract tests, 24 real D1 repository tests, and 27 real D1-backed public API tests pass,
  including deliberate release-publication rollback and representative response-schema parsing.
- Every public route returned the expected status over a real local Worker; the interactive Scalar
  client sent a real health request and received `200` with the local D1 connected.
- Public, documentation, and administration surfaces were visually inspected at 1440×1000 and
  390×844 with zero browser-console errors and no mobile horizontal overflow.
- Formatting, zero-warning lint, strict all-workspace TypeScript, both production builds, generated
  Worker binding types, and the production dependency audit pass.
- The naming audit found the public title, package/Worker identifiers, and canonical Git remote slug
  consistent; no unsafe versioned identifier rename was required.

### Phase 2 added

- Wrangler-managed D1 migrations for nine registry tables, constraints, relationships, and query
  indexes.
- Shared typed D1 repositories with prepared statements, stable errors, pagination, JSON helpers,
  injectable UUID/time generation, transactional release publishing, and append-only audit logs.
- Shared handle/name normalization, underscore separator policy, and a documented replaceable
  Unicode-confusable risk-signal subset.
- Zod-validated, idempotent local demonstration data covering ten fictional creators and hard,
  soft, monitored, common-name, alias, group, and regional cases.
- Local-only migrate, list, seed, reset, validate, inspect, and real D1 integration-test commands.
- Database and normalization policy documentation.

### Added

- Phase 1 npm-workspaces foundation.
- Separate public and administration React/Vite/Hono application shells.
- Shared domain-contract and design-token packages.
- Architecture, implementation-plan, local-development, and future-agent documentation.

### Verified

- Actual migrations and SQL constraints run in Cloudflare's Vitest Workers pool against D1 rather
  than repository mocks; the repository integration suite covers clean migration, idempotent seeding, CRUD,
  pagination, uniqueness, JSON, foreign keys, releases, ingestion, and append-only audit access.
- The local reset/migrate/seed/validate/inspect workflow completes with 10 demonstration creators,
  10 sources, 11 aliases, 12 reserved handles, nine domain tables, and no foreign-key violations.
- Formatting, zero-warning linting, all-workspace type checking, 35 unit tests, both production
  builds, concurrent local Worker startup, and the production dependency audit pass.
- Public and administration production builds run through the Cloudflare Vite plugin.
- Public search-shell feedback, admin architecture disclosure, desktop sidebar collapse, and mobile
  navigation behavior were exercised in the in-app browser.
- Both Worker boundaries return explicit `501 not_implemented` envelopes until their scheduled API
  phases, instead of exposing fabricated data.

### Fixed

- Completed the creator repository's prepared, pagination-compatible search across names, aliases,
  active handles, and verified external source identifiers while excluding released handles and
  unverified sources.
- Added the documented credential-free `.dev.vars.example` and clarified the combined local
  Worker persistence boundary in the README.
- Replaced stale Phase 1 interface copy so public search accurately points to Phases 3–4 and
  database-backed administration accurately remains deferred to Phase 5.
- Removed the closed mobile administration drawer and invisible scrim from keyboard and assistive
  technology navigation while preserving the off-canvas transition.
- Removed an ambiguous duplicate root `devDependencies` key that hid the direct Wrangler dependency.
- Added validation feedback for empty public searches and replaced the premature `/docs` route with
  an honest Phase 3 status control.
- Marked Phase 5 administration sections as unavailable instead of exposing inert navigation links,
  and clarified desktop and mobile navigation-toggle semantics.
