# Local development

## Prerequisites

- Node.js 22 or newer (`.nvmrc` contains the project version)
- npm 10 or newer
- No Cloudflare account or credentials are required for Phase 1 local development

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

## Quality commands

```bash
npm run format
npm run format:check
npm run lint
npm run typecheck
npm run test
npm run build
```

- `format` writes Prettier changes; `format:check` is the non-mutating CI check.
- `lint` applies ESLint to all workspaces with zero tolerated warnings.
- `typecheck` runs each workspace TypeScript configuration.
- `test` currently runs Phase 1 unit/smoke tests. Playwright is added with public workflows in Phase
  4 rather than installed before it is needed.
- `build` produces both Cloudflare Worker/Vite bundles.

## Environment files

Do not create credentials for Phase 1. When local bindings and connector configuration are added,
copy `.dev.vars.example` to `.dev.vars`; never commit `.dev.vars`.

## Troubleshooting

- If a port is busy, stop the conflicting process. Fixed ports keep documentation and future
  Playwright configuration deterministic.
- If types appear stale after changing a workspace export, restart Vite and rerun
  `npm run typecheck`.
- Remove neither `package-lock.json` nor workspace package declarations when updating dependencies;
  they make installs reproducible.
