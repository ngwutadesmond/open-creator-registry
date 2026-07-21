# Changelog

All notable changes to this project are documented here. The project follows semantic versioning
after its first public release.

## Unreleased

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
