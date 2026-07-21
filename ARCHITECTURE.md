# Architecture

## System shape

Open Creator Registry is an npm-workspaces monorepo with two separately deployable Cloudflare
Workers and small shared packages.

```text
                         one Cloudflare D1 database
                                      │
                     ┌────────────────┴────────────────┐
                     │                                 │
        Public Worker + React app          Admin Worker + React app
            public internet                    Cloudflare Access
                     │                                 │
       public API, docs, submissions,         private mutations, review,
          explorer and checker                   imports, releases, audit
                     └────────────────┬────────────────┘
                                      │
                     shared contracts and normalization
```

The public Worker never imports or exposes administrative routes. The admin Worker is a separate
deployment so Cloudflare Access can protect its complete hostname, not merely selected paths.

## Repository layout

```text
apps/
  public/       public Vite client and Hono Worker entry
  admin/        private Vite client and Hono Worker entry
packages/
  contracts/    framework-independent domain constants and types
  normalization/ shared handle/name normalization and confusable risk signals
  database/     D1 migrations, typed models, repositories, seeds, and local tooling
  ui/           shared CSS tokens and base styles
```

## Runtime model

Each application uses the Cloudflare Vite plugin. Vite serves the React client in development and
builds the client and Worker together for Cloudflare. Requests under each application's API prefix
run through Hono. Asset handling falls back to the Vite-built single-page application.

The public Worker routes `/api/v1/*`, `/openapi.json`, and `/docs` through the Phase 3 Hono API.
Other asset requests fall through to the React shell. Private administration routes remain a
truthful `not_implemented` response until Phase 5.

## Public client layering

```text
React route -> focused page/component -> typed Zod-validating API client -> public Hono API
```

The client uses `react-router` for deep-linkable routes and URL-owned explorer filters. Route pages
are lazy loaded except the home route. A small abortable resource hook handles GET loading, stable
errors, retries, and stale-request cancellation without adding a query-management framework. The
handle checker uses the shared normalization package at the browser boundary while retaining the
API as authority. The submission form sends only the public Phase 3 contract and never mutates
approved Registry records. See `PUBLIC_FRONTEND.md` for the route and component map.

## Public request layering

```text
Hono route -> Zod/OpenAPI validation -> focused service -> D1 repository -> public mapper
```

Routes own HTTP semantics, services own matching and public application policy, repositories own
prepared SQL, and mappers explicitly select public fields. Handle checking performs bounded,
set-based lookups for all normalized handles and confusable skeletons, then hydrates matched creators
in one bounded query. It never calls an external service. The batch route preserves request order
without issuing one query per input.

The matching service applies exact hard, exact soft, exact monitored, official alias, protected
variant, confusable, then ordinary alias precedence. Suspended/disputed reservations remain at least
soft-protected; released reservations are excluded while other evidence is still considered.
Conflicting creator identities set `ambiguous` and suppress creator attribution.

## Data ownership and consistency

Cloudflare D1 is the source of truth. Both Workers bind it as `DB`, use one migrations directory,
and use the canonical repository-root `.wrangler/state` when run individually. The combined local
shell-smoke command isolates each workerd process's ignored state to avoid SQLite ownership
contention; this does not affect Phase 2 because the interfaces do not query D1 yet. Deployed
Workers will bind one remote D1 database in Phase 7. Repository modules own SQL and use D1 prepared
statements; route and UI code do not compose SQL.

Administrative mutations use D1 batch operations where atomicity is required and will create an
audit record when Phase 5 adds mutation routes. Public responses expose only approved creators,
verified source-backed aliases/sources, active public handles, and public release history. Public
submissions write only a pending review record and cannot mutate live protection decisions.

## Shared contracts

The contracts package owns classification, recommended-action, review, status, tier, alias, source,
release, and ingestion literals so clients, APIs, importers, repositories, and tests cannot drift.
The normalization package is the sole implementation used by repositories, seeds, future APIs,
future imports, handle generation, and tests.

## Persistence packages

`packages/database` maps D1 rows into camel-cased domain models, safely serializes JSON text fields,
and maps not-found, unique, constraint, invalid-input, and unexpected failures into stable errors.
Repository methods accept `D1Database`; they do not know about Hono or React. UUID/time generation is
injectable for deterministic tests. See `DATABASE.md` and `NORMALIZATION.md` for schema and matching
details.

## Security boundaries

- Public API inputs are untrusted and are validated with Zod before repository access.
- Administrative authentication is enforced by Cloudflare Access at the whole Worker hostname.
- The admin Worker must still validate the Access identity assertion before trusting an actor
  identifier; deployment-layer protection is not a substitute for application validation.
- D1 operations use prepared statements; untrusted values are never concatenated into SQL.
- Secrets belong in `.dev.vars` locally and Worker secrets remotely. `.dev.vars` is ignored.
- Public responses must never include private administrator data or raw internal errors.
- The public Worker uses a strict origin allowlist, bounded bodies/pages/batches, short cache
  lifetimes, security headers, and an injectable rate-limit boundary. Distributed enforcement and
  bot protection require real Phase 7 Cloudflare configuration.

## Version and availability semantics

A registry release identifies a published dataset decision point. A handle-check response states
which release/version and update time informed it. Registry downtime or a `not_listed` response must
never be treated as permission to assign a suspicious username; the consuming platform keeps its
own availability check, cache, and critical-name fallback.

## Design system

Both applications share neutral, ink, and emerald design tokens from `packages/ui`. The public app
uses a restrained editorial headline treatment; the admin app uses denser operational typography.
Interfaces favor open layouts, rules, lists, and clear focus states over decorative card grids. The
public and private applications share visual provenance without sharing navigation or runtime code.
