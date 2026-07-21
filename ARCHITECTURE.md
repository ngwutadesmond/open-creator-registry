# Architecture

## System shape

Open Creator Registry is an npm-workspaces monorepo with two separately deployable Cloudflare
Workers and small shared packages.

```text
                         one Cloudflare D1 database (Phase 2)
                                      │
                     ┌────────────────┴────────────────┐
                     │                                 │
        Public Worker + React app          Admin Worker + React app
            public internet                    Cloudflare Access
                     │                                 │
          read-only API, explorer             private mutations, review,
          docs, public submissions              imports, releases, audit
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
  ui/           shared CSS tokens and base styles
```

Future Phase 2 packages add normalization and D1 repositories without merging the public and admin
deployment boundaries.

## Runtime model

Each application uses the Cloudflare Vite plugin. Vite serves the React client in development and
builds the client and Worker together for Cloudflare. Requests under each application's API prefix
run through Hono. Asset handling falls back to the Vite-built single-page application.

Phase 1 deliberately returns a truthful `not_implemented` response for API requests. Versioned
public routes are implemented in Phase 3 and private routes in Phase 5.

## Data ownership and consistency

Cloudflare D1 will be the source of truth. Both Workers will bind the same database using the same
binding name and schema migrations. Repository modules will own SQL and use D1 prepared statements;
route and UI code will not compose SQL.

Administrative mutations will use explicit transactions or D1 batch operations where atomicity is
required and will create an audit record. Public responses will expose only reviewed, active,
policy-approved fields.

## Shared contracts

The contracts package owns classification and recommended-action literals so the clients, APIs,
OpenAPI schemas, importers, and tests cannot drift. The future normalization package will similarly
be the sole implementation used by APIs, imports, seeds, handle generation, and tests.

## Security boundaries

- Public API inputs are untrusted and will be validated with Zod before repository access.
- Administrative authentication is enforced by Cloudflare Access at the whole Worker hostname.
- The admin Worker must still validate the Access identity assertion before trusting an actor
  identifier; deployment-layer protection is not a substitute for application validation.
- D1 operations use prepared statements; untrusted values are never concatenated into SQL.
- Secrets belong in `.dev.vars` locally and Worker secrets remotely. `.dev.vars` is ignored.
- Public responses must never include private administrator data or raw internal errors.

## Version and availability semantics

A registry release identifies a published dataset decision point. A handle-check response will state
which release/version and update time informed it. Registry downtime or a `not_listed` response must
never be treated as permission to assign a suspicious username; the consuming platform keeps its
own availability check, cache, and critical-name fallback.

## Design system

Both applications share neutral, ink, and emerald design tokens from `packages/ui`. The public app
uses a restrained editorial headline treatment; the admin app uses denser operational typography.
Interfaces favor open layouts, rules, lists, and clear focus states over decorative card grids. The
public and private applications share visual provenance without sharing navigation or runtime code.
