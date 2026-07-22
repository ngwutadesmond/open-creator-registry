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

Status: Complete and quality-gate reviewed on 2026-07-21.

- Add Wrangler-managed D1 migrations for all required tables, constraints, foreign keys, and query
  indexes.
- Add a typed D1 repository layer that uses prepared statements exclusively.
- Implement the shared handle-normalization and confusable-skeleton abstraction package.
- Define a Zod-validated demonstration seed dataset and add local-only migration, seed, reset,
  inspection, validation, and migration-list commands. CSV import belongs to Phase 5.
- Test actual local D1 migrations, schema constraints, normalization edge cases, idempotent seeding,
  repository operations, duplicate detection, status transitions, and stable database failures.
- Document local database setup, repository conventions, JSON storage, normalization policy, and
  the intentionally deferred remote D1 configuration.
- Verify both Phase 1 interfaces still load and retain truthful `501 not_implemented` Worker
  boundaries; no Phase 3 API or database-backed frontend work is included.
- Commit as `feat: add registry persistence and normalization`.

## Phase 3 — public API and generated documentation

Status: Complete and quality-gate reviewed on 2026-07-21.

- Implement versioned public Hono routes, consistent envelopes, request IDs, validation errors,
  pagination, safe error handling, CORS, security headers, size limits, and rate-limit abstraction.
- Generate OpenAPI from the same Zod route schemas via `@hono/zod-openapi`.
- Serve `/openapi.json` and interactive `/docs` with classification, version, authentication,
  caching, rate-limit, error, and integration semantics.
- Add unit and D1-backed integration tests for all public endpoint cases listed in the project brief.
- Verify all public routes over real local HTTP, the Scalar request tester, and public/docs/admin
  desktop and mobile renders with clean browser consoles.
- Commit as `feat: add public registry api and documentation`.

## Phase 4 — public registry experience

Status: Complete and quality-gate reviewed on 2026-07-21.

- Build the responsive public explorer, creator and handle details, protection checker, registry
  release view, API tester, and public submission flow.
- Connect all visible data to the public API; do not display invented metrics.
- Complete keyboard, screen-reader, focus, contrast, loading, empty, success, and error states.
- Add component and real-Worker Playwright coverage for critical public workflows, deep links,
  history, Scalar docs, submission invariants, the truthful admin boundary, and 390/320px layouts.
- Document the public client architecture, responsive visual fidelity, and accessibility behavior.
- Verify 20 frontend component tests and seven Chromium workflows in addition to all Phase 1–3
  tests; inspect 1536×1024, 1280×800, 768×1024, 390×844, and 320×844 renders.
- Commit as `feat: add public creator registry explorer`.

## Phase 5 — administration, imports, audit, and releases

Status: Complete and quality-gate reviewed on 2026-07-21.

- Implement the private admin API and interface for creators, aliases, sources, reserved handles,
  candidates, submissions, imports, ingestion runs, releases, and audit logs.
- Require an audit-log write for every administrative mutation and confirmations for destructive
  actions.
- Add JSON/CSV validation, duplicate detection, dry-run behavior, import summaries, and release
  publishing.
- Add admin API/integration tests and Playwright coverage for all specified critical workflows.
- Add default-deny authentication abstraction, centralized RBAC, two-person critical/release
  approvals, authenticated private OpenAPI/Scalar documentation, and responsive accessibility.
- Commit as `feat: add registry administration system`.

## Phase 6 — scheduled ingestion and source connectors

Status: Complete and quality-gate reviewed on 2026-07-21.

- Define connector contracts for future sources such as Wikidata and MusicBrainz.
- Implement a carefully scoped, disabled-by-default Wikidata proof of concept with explicit
  configuration and licensing provenance.
- Add an idempotent Cloudflare scheduled handler with bounded batches and ingestion-run visibility.
- Test retries, duplicates, partial failures, disabled configuration, and idempotency.
- Add optional normalized creator external profiles, private profile management with critical
  approval, public-only projection, and fixture-backed UI coverage.
- Commit as `feat: add scheduled ingestion framework`.

## Phase 7 — deployment, automation, security, and final QA

Status: Gate A local preparation and quality gate completed on 2026-07-22. No Cloudflare
authentication, remote resource, migration, Access application, secret, Cron Trigger, or deployment
was created. Gate B staging requires separate owner approval.

- Finalize separate Worker configurations that share one D1 binding.
- Add least-privilege GitHub Actions deployment workflows and Dependabot.
- Complete Cloudflare deployment, Cloudflare Access, secret, rollback, and troubleshooting docs.
- Complete API usage examples for curl, TypeScript, Dart, PHP, and the Merchrix integration flow.
- Complete source, dispute, security, contribution, and release policies.
- Run dependency, source, configuration, API, UI, accessibility, and end-to-end security/QA reviews.
- Perform real deployments only when the owner supplies/authenticates the required Cloudflare
  account; never claim an unperformed deployment.
- Commit Gate A as `feat: prepare cloudflare deployment and production security`.
- Stop after Gate A; staging and production operations are later approval gates.

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
