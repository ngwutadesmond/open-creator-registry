# Local development

## Prerequisites

- Node.js 22 or newer (`.nvmrc` contains the project version)
- npm 10 or newer
- No Cloudflare account or credentials are required for Phase 4 local development

## Install

From the repository root:

```bash
npm install
```

There is intentionally no `install` npm lifecycle script. `npm install` already owns that lifecycle;
making it invoke itself would recurse. The root command installs every workspace.

## Run both applications

```bash
npm run dev
```

| Application | URL                     | Worker/API prefix |
| ----------- | ----------------------- | ----------------- |
| Public      | `http://localhost:5173` | `/api/*`          |
| Admin       | `http://localhost:5174` | `/api/admin/*`    |

Run one application when focusing on a single surface:

```bash
npm run dev:public
npm run dev:admin
```

The public Worker exposes the Phase 3 API and Phase 4 frontend. The administration Worker still
returns `501 not_implemented`; its private API belongs to Phase 5.

`npm run dev` uses separate ignored persistence directories for the two simultaneous local workerd
processes. This avoids local SQLite file-lock contention and is suitable for inspecting both
application shells. To use the canonical migrated and seeded D1 state with the public API, stop the
combined command and run only `npm run dev:public`; either individual command uses
`.wrangler/state/v3/d1`. The deployed Workers will share one actual D1 database after Phase 7
configuration.

## Set up the local database

The following command deletes only this repository's ignored `.wrangler/state` directory, applies
all migrations, inserts demonstration data, and validates the schema:

```bash
npm run db:reset:local
```

Expected summary: 10 creators, 10 sources, 11 aliases, and 12 reserved handles. The seed identifies
itself as local demonstration data and is not an authoritative creator list.

Inspect the result:

```bash
npm run db:migrations:list
npm run db:validate
npm run db:inspect:local
```

Use individual commands after adding a migration or changing a seed fixture:

```bash
npm run db:migrate:local
npm run db:seed:local
```

The seed is idempotent; running `db:seed:local` repeatedly does not duplicate records. The database
scripts and either individually started Vite Worker use `.wrangler/state/v3/d1` through the shared
`DB` binding.

There are no remote D1 commands. Do not add a real database ID or log in to Cloudflare during
Phase 3. Remote creation, binding, migrations, and deployment are documented and performed in
Phase 7.

## Exercise the public API

Start the seeded public Worker:

```bash
npm run db:reset:local
npm run db:seed:local
npm run dev:public
```

Leave that terminal running. In a second terminal, test the health and handle endpoints:

```bash
curl -i http://localhost:5173/api/v1/health
curl --get http://localhost:5173/api/v1/handles/check \
  --data-urlencode 'handle=@demo.aurora-vale'
```

Open `http://localhost:5173/docs` for the interactive API reference or
`http://localhost:5173/openapi.json` for the generated specification. Press `Ctrl+C` in the first
terminal when finished. More examples are in `API_USAGE.md`.

## Quality commands

```bash
npm run format
npm run format:check
npm run lint
npm run typecheck
npm run test
npm run test:unit
npm run test:frontend
npm run test:database
npm run test:api
npm run test:e2e
npm run build
```

`test:e2e` resets canonical local D1 state, starts the public Worker and the separate admin shell,
and runs the critical public workflows in Chromium. Install Playwright's pinned local browser once
after `npm install` if it is not already cached:

```bash
npx playwright install chromium
```

Playwright output is written to ignored `test-results/` and `playwright-report/` directories.

- `format` writes Prettier changes; `format:check` is the non-mutating CI check.
- `lint` applies ESLint to all workspaces with zero tolerated warnings.
- `typecheck` runs each workspace TypeScript configuration.
- `test:unit` runs framework, contract, and normalization tests in Node.
- `test:database` runs the actual SQL migrations and repositories in Cloudflare's Vitest pool with
  isolated Miniflare-backed D1 storage. It does not mock D1 behavior.
- `test:api` runs the public Worker through Cloudflare's Vitest pool against actual migrated D1.
- `test` runs all three suites. Playwright is added with public workflows in Phase 4 rather than
  installed before it is needed.
- `build` produces both Cloudflare Worker/Vite bundles.

Regenerate committed public Worker binding types only after Wrangler bindings change:

```bash
npm run types:worker:public
```

## Environment files

Do not create credentials for Phase 3. Local D1 needs no `.dev.vars`. When connector configuration
is added in a later phase, copy `.dev.vars.example` to `.dev.vars`; never commit `.dev.vars`.

## Troubleshooting

- If a port is busy, stop the conflicting process. Fixed ports keep documentation and future
  Playwright configuration deterministic.
- If an endpoint reports `database_unavailable`, stop the Worker, run `npm run db:reset:local`, and
  restart `npm run dev:public`.
- If the interactive reference is blank while the API works, check the browser console and network
  panel. `/docs` currently needs access to the exact pinned Scalar bundle on `cdn.jsdelivr.net`.
- If types appear stale after changing a workspace export, restart Vite and rerun
  `npm run typecheck`.
- Remove neither `package-lock.json` nor workspace package declarations when updating dependencies;
  they make installs reproducible.
- If local data is inconsistent after a migration under active development, run
  `npm run db:reset:local`. This removes local demonstration data only; it has no remote capability.
- See `DATABASE.md` for schema policy and `NORMALIZATION.md` for exact matching rules.
