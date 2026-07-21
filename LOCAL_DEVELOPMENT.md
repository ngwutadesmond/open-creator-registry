# Local development

## Prerequisites

- Node.js 22 or newer (`.nvmrc` contains the project version)
- npm 10 or newer
- No Cloudflare account or credentials are required for Phase 2 local development

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

The Phase 1 Worker routes return `501 not_implemented`. This is deliberate: the public API is Phase
3 and the admin API is Phase 5. No response in Phase 1 represents live registry data.

`npm run dev` uses separate ignored persistence directories for the two simultaneous local workerd
processes. This avoids local SQLite file-lock contention and is suitable for inspecting the Phase 1
interfaces. To develop against the canonical seeded D1 state, stop the combined command and run
only `npm run dev:public` or `npm run dev:admin`; either individual command uses
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

There are no remote D1 commands. Do not add a real database ID or log in to Cloudflare during Phase 2. Remote creation, binding, migrations, and deployment are documented and performed in Phase 7.

## Quality commands

```bash
npm run format
npm run format:check
npm run lint
npm run typecheck
npm run test
npm run test:unit
npm run test:database
npm run build
```

- `format` writes Prettier changes; `format:check` is the non-mutating CI check.
- `lint` applies ESLint to all workspaces with zero tolerated warnings.
- `typecheck` runs each workspace TypeScript configuration.
- `test:unit` runs framework, contract, and normalization tests in Node.
- `test:database` runs the actual SQL migrations and repositories in Cloudflare's Vitest pool with
  isolated Miniflare-backed D1 storage. It does not mock D1 behavior.
- `test` runs both suites. Playwright is added with public workflows in Phase 4 rather than
  installed before it is needed.
- `build` produces both Cloudflare Worker/Vite bundles.

## Environment files

Do not create credentials for Phase 2. Local D1 needs no `.dev.vars`. When connector configuration
is added in a later phase, copy `.dev.vars.example` to `.dev.vars`; never commit `.dev.vars`.

## Troubleshooting

- If a port is busy, stop the conflicting process. Fixed ports keep documentation and future
  Playwright configuration deterministic.
- If types appear stale after changing a workspace export, restart Vite and rerun
  `npm run typecheck`.
- Remove neither `package-lock.json` nor workspace package declarations when updating dependencies;
  they make installs reproducible.
- If local data is inconsistent after a migration under active development, run
  `npm run db:reset:local`. This removes local demonstration data only; it has no remote capability.
- See `DATABASE.md` for schema policy and `NORMALIZATION.md` for exact matching rules.
