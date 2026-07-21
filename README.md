# Open Creator Registry

Open Creator Registry is an open-source registry that tells consuming platforms how a requested
creator handle should be protected. It does **not** determine whether that handle is available on a
platform.

The repository is being delivered in the seven verified phases described in [PLAN.md](./PLAN.md).
Phases 1–2 provide the monorepo foundation, separate application shells, shared local D1
persistence, and normalization. Phase 3 adds the complete read-oriented public API, pending public
submissions, generated OpenAPI specification, and interactive API reference.

## Applications

- `apps/public`: public React application and public Hono Worker boundary
- `apps/admin`: private React administration application and private Hono Worker boundary

The applications are intentionally separate deployable Workers. In production, the entire admin
Worker URL must be protected with Cloudflare Access. Both Workers use the same `DB` binding and
canonical local D1 state when run individually. The combined shell-smoke command uses isolated
ignored state for its two simultaneous local workerd processes, as explained in
[DATABASE.md](./DATABASE.md).

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
npm run dev:public
```

The public application runs at `http://localhost:5173`, and its API reference is at
`http://localhost:5173/docs`. Stop it, then run `npm run dev:admin` to inspect the admin shell at
`http://localhost:5174`. See [LOCAL_DEVELOPMENT.md](./LOCAL_DEVELOPMENT.md) for the reason local D1
applications are run individually and [API_USAGE.md](./API_USAGE.md) for client examples.

## Project status

This is an early phased implementation. The public Worker exposes the Phase 3 API locally against
demonstration D1 data. The public database-backed explorer remains Phase 4, and administration
routes remain explicit `501 not_implemented` boundaries until Phase 5. No remote database or
deployment is configured; do not use this version as a production registry service.

## Domain disclaimer

Registry status is not legal ownership, trademark proof, endorsement, identity proof, or platform
availability. `not_listed` means only that the Registry currently has no reason to protect the
handle; the consuming platform must still perform its own availability check.
