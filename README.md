# Open Creator Registry

Open Creator Registry is an open-source registry that tells consuming platforms how a requested
creator handle should be protected. It does **not** determine whether that handle is available on a
platform.

The repository is being delivered in the seven verified phases described in [PLAN.md](./PLAN.md).
Phases 1–2 provide the monorepo foundation, separate application shells, shared local D1
persistence, and normalization. Phase 3 adds the complete read-oriented public API and generated API
reference. Phase 4 adds the responsive public experience. Phase 5 adds the private administration
API and interface, review queues, imports, approvals, audit history, and release publication.
Phase 6 adds an evidence-only scheduled-ingestion framework, a disabled-by-default Wikidata proof
of concept, persistent checkpoints and leases, candidate provenance, and optional reviewed creator
platform profiles. It does not configure a production schedule or automatically approve creators,
reserve handles, or publish releases.
Phase 7 Gate A adds local-only deployment preparation: isolated staging/production configuration,
Access JWT validation, rate-limit bindings, self-hosted API documentation assets, observability,
guarded migration/deployment/smoke tooling, CI, and operator runbooks. It creates no remote resource.
The Gate B sequencing correction adds structural, public-ready, admin-bootstrap, and admin-final
validation so account-neutral templates can be retained and each staging target can be
materialized and deployed independently. Gates B and C subsequently accepted isolated staging and
production deployments with separate D1 databases and Cloudflare Access applications. External
ingestion and scheduled execution remain disabled.

## Applications

- `apps/public`: public React application and public Hono Worker boundary
- `apps/admin`: private React administration application and private Hono Worker boundary

The applications are intentionally separate deployable Workers. In production, the entire admin
Worker URL must be protected with Cloudflare Access. Both Workers use the same `DB` binding and
canonical local D1 state when run individually or together.

## Packages

- `packages/contracts`: shared classifications and recommended actions
- `packages/normalization`: canonical handle/name normalization and confusable risk signals
- `packages/database`: migrations, typed models, prepared-statement repositories, and seed tooling
- `packages/ingestion`: connector contracts, bounded orchestration, offline fixtures, and scheduling
- `packages/ui`: shared visual tokens and base styles

## Start locally

Prerequisites: Node.js 22+ and npm 10+.

```bash
npm install
npm run db:reset:local
cp apps/admin/.dev.vars.example apps/admin/.dev.vars
npm run dev
```

The public application runs at `http://localhost:5173`; the authenticated local admin app runs at
`http://localhost:5174`. Their references are `/docs` and `/admin-docs` respectively.

## Project status

Phases 1–6 and Phase 7 Gates A–C are complete. The initial workers.dev production deployment is an
empty, unpublished Registry with isolated public and administration Workers, a dedicated D1
database, complete-hostname Cloudflare Access protection, application-level Access JWT validation,
and observability. Wikidata, scheduled ingestion, and Cron remain disabled; no production creator
data or Registry release has been onboarded. Production data onboarding requires a separate
reviewed decision and audited administration workflow. Begin with
[DEPLOYMENT.md](./DEPLOYMENT.md),
[CLOUDFLARE_RESOURCE_MANIFEST.md](./CLOUDFLARE_RESOURCE_MANIFEST.md), and
[ADMIN_AUTHENTICATION.md](./ADMIN_AUTHENTICATION.md).

## Domain disclaimer

Registry status is not legal ownership, trademark proof, endorsement, identity proof, or platform
availability. `not_listed` means only that the Registry currently has no reason to protect the
handle; the consuming platform must still perform its own availability check.
