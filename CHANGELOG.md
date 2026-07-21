# Changelog

All notable changes to this project are documented here. The project follows semantic versioning
after its first public release.

## Unreleased

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
  than repository mocks; 21 integration tests cover clean migration, idempotent seeding, CRUD,
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
