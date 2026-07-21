# Codex engineering guide

Read `PLAN.md`, `ARCHITECTURE.md`, and this file before changing the project.

## Architecture

- `apps/public` is the public React/Vite application and public Hono Worker.
- `apps/admin` is a separate private React/Vite application and Hono Worker. Never link it from
  public navigation.
- Both Workers will bind the same D1 database, but they do not share route modules.
- Framework-independent rules live in shared packages. SQL belongs only in repository modules.
- UI surfaces share tokens, not navigation or private data.

## Commands

```bash
npm install
npm run dev
npm run dev:public
npm run dev:admin
npm run format
npm run format:check
npm run lint
npm run typecheck
npm run test
npm run test:frontend
npm run test:database
npm run test:api
npm run test:e2e
npm run build
npm run types:worker:public
npm run db:reset:local
npm run db:migrate:local
npm run db:migrations:list
npm run db:seed:local
npm run db:validate
npm run db:inspect:local
```

Database and seed commands are local-only and documented in `LOCAL_DEVELOPMENT.md` and `DATABASE.md`.
Playwright is local-only and documented in `LOCAL_DEVELOPMENT.md`. Deployment commands remain
deferred until Phase 7 and must be documented before use.

## Conventions

- TypeScript strict mode is mandatory. Avoid `any`; validate unknown external input.
- Prefer small, feature-owned modules and direct imports over broad barrel files.
- Keep React render logic pure, derive simple state during render, and do not add effects for event
  handling.
- Start independent asynchronous work together and await it together; avoid request waterfalls.
- Keep Cloudflare Worker compatibility in mind: do not depend on heavyweight Node-only servers.
- Use Zod schemas as executable boundaries and derive OpenAPI from the actual route schemas. Keep
  Phase 3 request, response, and OpenAPI schemas synchronized in `apps/public/src/api/schemas.ts`.
- Use D1 prepared statements for every value. Never concatenate untrusted SQL fragments.
- Import repositories from `@open-creator-registry/database/repositories/*`; never put SQL in a
  Worker route or React component.
- Use `@open-creator-registry/normalization` for every handle/name comparison or write.
- Keep public route handlers thin: HTTP in routes, policy in services, SQL in repositories, and
  field selection in public mappers. Handle checks must remain local and set-based.
- Public API errors use stable envelopes and request IDs. Do not log submission bodies, SQL text,
  secrets, or stack traces.
- Browser requests belong in `apps/public/src/client/api`; validate envelopes, abort stale reads,
  keep explorer state in URL parameters, and never hardcode a result that the public API owns.
- Public frontend routes must remain directly loadable and refresh-safe. Keep admin routes and code
  out of the public navigation and bundle.
- Keep audit logs append-only and creator evidence relationships restrictive by default.
- Use the injectable metadata provider for repository IDs/timestamps in deterministic tests.
- Add dependencies only when the platform or a clear maintenance benefit justifies them.
- Include comments only when they explain a non-obvious invariant or security decision.
- Use conventional commits and one verified commit per project phase.

## Non-negotiable domain rules

- The Registry classifies protection; it never reports username availability.
- Never add a `username_available` response field.
- `hard_reserved` maps to `deny_and_offer_claim`.
- `soft_protected` maps to `require_claim_or_review`.
- `monitored` maps to `allow_with_impersonation_monitoring`.
- `not_listed` maps to `perform_platform_availability_check`.
- A fuzzy, alias, separator, or confusable match is evidence, not proof that identities are equal.
- Registry downtime must not automatically grant a suspicious handle.
- Public output must not expose private administrator or unreviewed source data.
- Every administrative mutation must write an audit log.
- Demonstration records must be visibly identified as demonstration data.

## Definition of done for a phase

Run formatting checks, lint, type checking, tests, production builds, local applications, and
rendered desktop/mobile inspection. Fix discovered issues, update documentation and `CHANGELOG.md`,
review the diff for secrets and boundary violations, then create the phase commit. Never claim a
deployment, external integration, credential, or successful remote operation that did not occur.
