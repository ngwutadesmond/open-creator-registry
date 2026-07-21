# Local development

## Prerequisites

- Node.js 22 or newer (`.nvmrc` contains the project version)
- npm 10 or newer
- No Cloudflare account or credentials are required for Phase 6 local development

## Install

From the repository root:

```bash
npm install
```

There is intentionally no `install` npm lifecycle script. `npm install` already owns that lifecycle;
making it invoke itself would recurse. The root command installs every workspace.

## Run both applications

Configure the two deterministic, non-production local identities first:

```bash
cp apps/admin/.dev.vars.example apps/admin/.dev.vars
```

Review the copied values if another local developer is sharing the machine. Do not use real
administrator identities and never commit `.dev.vars`.

```bash
npm run dev
```

| Application | URL                     | Worker/API prefix |
| ----------- | ----------------------- | ----------------- |
| Public      | `http://localhost:5173` | `/api/v1/*`       |
| Admin       | `http://localhost:5174` | `/api/admin/v1/*` |

Run one application when focusing on a single surface:

```bash
npm run dev:public
npm run dev:admin
```

Both Workers use the same canonical local D1 state. A mutation in the admin app is visible to the
public Worker when public-visibility rules allow it. `Ctrl+C` stops both. Individual commands are
useful while focusing on one surface. The combined launcher intentionally waits for the public
health endpoint before starting the admin Worker so Miniflare does not try to recover the shared
local D1 database from two simultaneous startups.

## Set up the local database

The following command deletes only this repository's ignored `.wrangler/state` directory, applies
all migrations, inserts demonstration data, and validates the schema:

```bash
npm run db:reset:local
```

Expected summary: 10 creators, 10 sources, 11 aliases, 12 reserved handles, 2 external profiles,
and 1 disabled source configuration. The seed identifies
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
Phase 6. Remote creation, binding, migrations, and deployment are documented and performed in
Phase 7.

## Fixture-backed Wikidata ingestion

Normal tests never use the network. To exercise the deterministic fixture, edit only the ignored
`apps/admin/.dev.vars` copy:

```dotenv
WIKIDATA_FIXTURE_MODE=enabled
```

Restart `npm run dev:admin`, open `http://localhost:5174/ingestion-runs`, and confirm Wikidata is
disabled. Select **Enable**, then **Preview** or **Run**. Enabling in this local fixture panel
explicitly turns dry-run off; preview always remains non-mutating. Inspect a run, its record
outcomes, generated pending candidates, candidate provenance, and checkpoint. Repeating the run
records duplicates rather than creating another candidate. Disable the source when finished.

Equivalent authenticated API calls, with the local cookie/configuration in place, are:

```bash
curl -X PATCH http://localhost:5174/api/admin/v1/source-configurations/wikidata \
  -H 'Content-Type: application/json' \
  --data '{"enabled":true,"dry_run":false,"reason":"Enable local fixture"}'
curl -X POST http://localhost:5174/api/admin/v1/ingestion-runs/preview \
  -H 'Content-Type: application/json' \
  --data '{"source_name":"wikidata","scope_key":"default"}'
curl -X POST http://localhost:5174/api/admin/v1/ingestion-runs/start \
  -H 'Content-Type: application/json' \
  --data '{"source_name":"wikidata","scope_key":"default"}'
curl http://localhost:5174/api/admin/v1/ingestion-runs
curl http://localhost:5174/api/admin/v1/source-checkpoints
```

Reset a checkpoint through the confirmed admin UI or call its returned UUID:

```bash
curl -X POST http://localhost:5174/api/admin/v1/source-checkpoints/CHECKPOINT_UUID/reset \
  -H 'Content-Type: application/json' \
  --data '{"reason":"Restart reviewed local fixture scope"}'
```

To invoke the actual Cloudflare scheduled handler locally, stop the Vite admin Worker and use two
terminals:

```bash
npm run ingestion:serve:local
npm run ingestion:trigger:local
```

The first command runs Wrangler on port 8788 with test scheduling enabled. The second calls the
local scheduled endpoint. No remote Cron Trigger or remote resource is created.

## Exercise the administration application

After reset and local identity setup:

```bash
npm run dev:admin
```

Open `http://localhost:5174`. Private API docs are at
`http://localhost:5174/admin-docs`; the JSON specification is `/admin-openapi.json`. Open
**Settings** to switch between the configured primary and secondary identities for two-person
approval testing. Production remains denied; the local switch endpoint cannot accept an arbitrary
email or role.

For real cross-Worker workflows, run `npm run dev` and open both ports. The public Worker must not
expose `/api/admin/*` or `/admin-docs`.

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
npm run test:admin-api
npm run test:ingestion
npm run test:e2e
npm run build
```

`test:e2e` resets canonical local D1 state, starts both separate Workers against it, and runs the
critical public and administration workflows in Chromium. Install Playwright's pinned local browser once
after `npm install` if it is not already cached:

```bash
npx playwright install chromium
```

Playwright output is written to ignored `test-results/` and `playwright-report/` directories.

- `format` writes Prettier changes; `format:check` is the non-mutating CI check.
- `lint` applies ESLint to all workspaces with zero tolerated warnings.
- `typecheck` runs each workspace TypeScript configuration.
- `test:unit` runs framework, contract, and normalization tests in Node.
- `test:ingestion` runs deterministic connector/retry/query-mapping tests without network access.
- `test:database` runs the actual SQL migrations and repositories in Cloudflare's Vitest pool with
  isolated Miniflare-backed D1 storage. It does not mock D1 behavior.
- `test:api` and `test:admin-api` run the separate Workers through Cloudflare's Vitest pool against
  actual migrated D1.
- `test` runs unit, frontend, database, public API, and admin API suites. Playwright remains a
  separate destructive clean-state command.
- `build` produces both Cloudflare Worker/Vite bundles.

Regenerate committed public Worker binding types only after Wrangler bindings change:

```bash
npm run types:worker:public
npm run types:worker:admin
```

## Environment files

Local D1 needs no secret. The admin Worker needs the ignored `apps/admin/.dev.vars` described above.
Root and app templates are safe examples only. Never commit any `.dev.vars` file.

## Troubleshooting

- If a port is busy, stop the conflicting process. Fixed ports keep documentation and future
  Playwright configuration deterministic.
- If the admin app says access is denied, confirm `apps/admin/.dev.vars` exists, contains
  `ENVIRONMENT=local` and `AUTH_PROVIDER=local_development`, then restart `npm run dev:admin`.
- If the wrong local administrator is active, use Settings or clear the `ocr_dev_admin` cookie.
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
- If either Worker reports D1 unavailable, stop both, reset D1, and restart. Do not delete files
  outside this repository or add a `--remote` flag.
- See `DATABASE.md` for schema policy and `NORMALIZATION.md` for exact matching rules.
- If an ingestion run reports locked, inspect the source configuration page. Wait for an active
  run/lease to finish. A super administrator may force-release only after confirming the owner is
  no longer running; that action requires a reason and writes an audit record.
- If fixture preview would call Wikidata, `WIKIDATA_FIXTURE_MODE=enabled` was not loaded. Put it in
  ignored `apps/admin/.dev.vars` and restart. Never add it to committed Worker variables.
- Live Wikidata testing is intentionally not automated in Phase 6. The documented tests are offline;
  public-service availability is not part of the quality gate.
