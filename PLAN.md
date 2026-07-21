# Open Creator Registry implementation plan

This plan is the source of truth for phased delivery. A phase is complete only after its code,
documentation, automated checks, local runtime check, rendered-UI inspection, and conventional
commit are complete.

## Non-negotiable domain boundary

The Registry classifies protection risk. It does not decide whether a username is available on a
consuming platform, establish legal ownership, prove trademark rights, or endorse a person.

| Classification   | Registry meaning                                                       | Recommended action                    |
| ---------------- | ---------------------------------------------------------------------- | ------------------------------------- |
| `hard_reserved`  | Exact protected handle                                                 | `deny_and_offer_claim`                |
| `soft_protected` | Alias, official-style variant, confusable, or strong similarity signal | `require_claim_or_review`             |
| `monitored`      | Possible creator, fan community, or public-figure reference            | `allow_with_impersonation_monitoring` |
| `not_listed`     | No current registry reason to protect the handle                       | `perform_platform_availability_check` |

Fuzzy or confusable matching is evidence for review; it never proves identity.

## Phase 1 — foundation and local application shells

Status: Complete and quality-gate reviewed on 2026-07-21.

- Create the npm-workspaces monorepo and shared TypeScript/tooling configuration.
- Create separately runnable public and admin React/Vite applications backed by separate Hono
  Worker entry points.
- Create shared domain-contract and UI-token packages.
- Establish the public and private navigation boundaries.
- Document the architecture, local development workflow, conventions, and phase gates.
- Verify formatting, linting, type checking, unit tests, production builds, local startup, and the
  rendered desktop/mobile shells.
- Commit as `feat: establish monorepo application foundation`.

## Phase 2 — persistence, normalization, and seed data

- Add Wrangler-managed D1 migrations for all required tables, constraints, foreign keys, and query
  indexes.
- Add a typed D1 repository layer that uses prepared statements exclusively.
- Implement the shared handle-normalization and confusable-skeleton abstraction package.
- Define validated seed JSON and CSV formats, seed clearly labelled demonstration records, and add
  local/remote migration and seed scripts.
- Test schema constraints, normalization edge cases, duplicate handles, and repository failures.
- Document every database command and manual D1 creation/binding step.
- Commit as `feat: add registry persistence and normalization`.

## Phase 3 — public API and generated documentation

- Implement versioned public Hono routes, consistent envelopes, request IDs, validation errors,
  pagination, safe error handling, CORS, security headers, size limits, and rate-limit abstraction.
- Generate OpenAPI from the same Zod route schemas via `@hono/zod-openapi`.
- Serve `/openapi.json` and interactive `/docs` with classification, version, authentication,
  caching, rate-limit, error, and integration semantics.
- Add unit and D1-backed integration tests for all public endpoint cases listed in the project brief.
- Commit as `feat: implement public registry API`.

## Phase 4 — public registry experience

- Build the responsive public explorer, creator and handle details, protection checker, registry
  release view, API tester, and public submission flow.
- Connect all visible data to the public API; do not display invented metrics.
- Complete keyboard, screen-reader, focus, contrast, loading, empty, success, and error states.
- Add Playwright coverage for the critical public workflows and inspect desktop/mobile renders.
- Commit as `feat: build public registry experience`.

## Phase 5 — administration, imports, audit, and releases

- Implement the private admin API and interface for creators, aliases, sources, reserved handles,
  candidates, submissions, imports, ingestion runs, releases, and audit logs.
- Require an audit-log write for every administrative mutation and confirmations for destructive
  actions.
- Add JSON/CSV validation, duplicate detection, dry-run behavior, import summaries, and release
  publishing.
- Add admin API/integration tests and Playwright coverage for all specified critical workflows.
- Commit as `feat: implement registry administration`.

## Phase 6 — scheduled ingestion and source connectors

- Define connector contracts for future sources such as Wikidata and MusicBrainz.
- Implement a carefully scoped, disabled-by-default Wikidata proof of concept with explicit
  configuration and licensing provenance.
- Add an idempotent Cloudflare scheduled handler with bounded batches and ingestion-run visibility.
- Test retries, duplicates, partial failures, disabled configuration, and idempotency.
- Commit as `feat: add scheduled ingestion framework`.

## Phase 7 — deployment, automation, security, and final QA

- Finalize separate Worker configurations that share one D1 binding.
- Add least-privilege GitHub Actions deployment workflows and Dependabot.
- Complete Cloudflare deployment, Cloudflare Access, secret, rollback, and troubleshooting docs.
- Complete API usage examples for curl, TypeScript, Dart, PHP, and the Merchrix integration flow.
- Complete source, dispute, security, contribution, and release policies.
- Run dependency, source, configuration, API, UI, accessibility, and end-to-end security/QA reviews.
- Perform real deployments only when the owner supplies/authenticates the required Cloudflare
  account; never claim an unperformed deployment.
- Commit as `chore: prepare production deployment and release`.

## Cross-phase quality gate

For every phase:

1. Install only justified dependencies and record any new operational command.
2. Run `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm run test`, and
   `npm run build`.
3. Start the affected applications, exercise their critical paths, and inspect desktop and mobile
   rendering.
4. Fix failures and regressions before continuing.
5. Update `README.md`, `ARCHITECTURE.md`, `LOCAL_DEVELOPMENT.md`, `AGENTS.md`, and
   `CHANGELOG.md` when the phase changes their claims.
6. Review the diff for credentials, unsafe SQL, private-data exposure, and phase-scope drift.
7. Create exactly one clear conventional commit for the completed phase.
8. Report completed work, checks, changed files, limitations, and any exact manual action required.
