# Open Creator Registry

Open Creator Registry is an open-source registry that tells consuming platforms how a requested
creator handle should be protected. It does **not** determine whether that handle is available on a
platform.

The repository is being delivered in the seven verified phases described in [PLAN.md](./PLAN.md).
Phase 1 provides the monorepo foundation and independently runnable public and administration
application shells. Phase 2 adds the shared local D1 persistence and normalization foundation.

## Applications

- `apps/public`: public React application and public Hono Worker boundary
- `apps/admin`: private React administration application and private Hono Worker boundary

The applications are intentionally separate deployable Workers. In production, the entire admin
Worker URL must be protected with Cloudflare Access. Both Workers receive the same local D1 database
through the `DB` binding.

## Packages

- `packages/contracts`: shared classifications and recommended actions
- `packages/normalization`: canonical handle/name normalization and confusable risk signals
- `packages/database`: migrations, typed models, prepared-statement repositories, and seed tooling
- `packages/ui`: shared visual tokens and base styles

## Start locally

Prerequisites: Node.js 22+ and npm 10+.

```bash
npm install
npm run db:reset:local
npm run dev
```

The public shell runs at `http://localhost:5173` and the admin shell at
`http://localhost:5174`. See [LOCAL_DEVELOPMENT.md](./LOCAL_DEVELOPMENT.md) for individual commands
and verification steps.

## Project status

This is an early phased implementation. D1 persistence is available locally, while the Phase 1
interfaces truthfully state that real API and administration workflows are not connected yet.
Those routes remain `501` until Phases 3 and 5. Do not use this version as a production registry
service.

## Domain disclaimer

Registry status is not legal ownership, trademark proof, endorsement, identity proof, or platform
availability. `not_listed` means only that the Registry currently has no reason to protect the
handle; the consuming platform must still perform its own availability check.
