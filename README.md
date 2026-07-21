# Open Creator Registry

Open Creator Registry is an open-source registry that tells consuming platforms how a requested
creator handle should be protected. It does **not** determine whether that handle is available on a
platform.

The repository is being delivered in the seven verified phases described in [PLAN.md](./PLAN.md).
Phase 1 provides the monorepo foundation and independently runnable public and administration
application shells. Database-backed registry behavior begins in Phase 2.

## Applications

- `apps/public`: public React application and public Hono Worker boundary
- `apps/admin`: private React administration application and private Hono Worker boundary

The applications are intentionally separate deployable Workers. In production, the entire admin
Worker URL must be protected with Cloudflare Access. Both Workers will receive the same D1 database
binding when persistence is added.

## Packages

- `packages/contracts`: shared classifications and recommended actions
- `packages/ui`: shared visual tokens and base styles

## Start locally

Prerequisites: Node.js 22+ and npm 10+.

```bash
npm install
npm run dev
```

The public shell runs at `http://localhost:5173` and the admin shell at
`http://localhost:5174`. See [LOCAL_DEVELOPMENT.md](./LOCAL_DEVELOPMENT.md) for individual commands
and verification steps.

## Project status

This is an early phased implementation. The Phase 1 interfaces truthfully state that D1-backed
metrics and registry workflows are not connected yet. Do not use this version as a production
registry service.

## Domain disclaimer

Registry status is not legal ownership, trademark proof, endorsement, identity proof, or platform
availability. `not_listed` means only that the Registry currently has no reason to protect the
handle; the consuming platform must still perform its own availability check.
