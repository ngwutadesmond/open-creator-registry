# OpenAPI documentation

## Source of truth

The public Worker uses `OpenAPIHono` and `createRoute` from `@hono/zod-openapi`. Request parameters,
bodies, success payloads, and error envelopes refer directly to the Zod schemas in
`apps/public/src/api/schemas.ts`. The Worker registers those route definitions and produces an
OpenAPI 3.1 document at runtime; there is no second handwritten endpoint contract.

Documentation-only entries for `/openapi.json` and `/docs` are registered in the same OpenAPI
registry so the generated document describes every public route. Administration routes are not
imported by the public Worker and must never appear in this specification.

The admin Worker independently generates its authenticated specification from its own Zod route
schemas at `/admin-openapi.json` and serves Scalar at `/admin-docs`. Those endpoints use the same
default-deny identity boundary and role checks as the private API. See `ADMIN_API.md` and
`ADMIN_AUTHENTICATION.md`; the public specification never imports or links them.

## Inspect locally

```bash
npm run db:reset:local
npm run dev:public
```

Then open:

- specification: `http://localhost:5173/openapi.json`
- interactive Scalar reference: `http://localhost:5173/docs`

The Scalar renderer is pinned to an exact package version on jsDelivr. It is the only third-party
script used by the documentation page and is allowlisted only on that route's nonce-based Content
Security Policy. Scalar telemetry, AI, and developer tools are disabled. Scalar's font origin is
allowlisted without granting it script or connection access. Production should self-host the
renderer or add a reviewed integrity strategy in Phase 7. The rest of the API receives a
`default-src 'none'` policy.

## Validate

```bash
npm run test:unit -- apps/public/src/api/openapi.test.ts
npm run test:api
```

The contract test passes the generated object to Swagger Parser, checks the exact public path set,
checks classification and action enums, and rejects administration or availability fields. D1
integration tests parse representative real endpoint responses through their exported Zod response
schemas, which catches implementation/schema drift.

Worker binding types are generated from the public Wrangler configuration:

```bash
npm run types:worker:public
```

Commit the regenerated `apps/public/src/worker-configuration.d.ts` when binding declarations change.

## Version semantics

`info.version` is the semantic public API contract version. `registry_version` is different: it
identifies the published Registry dataset/decision point used for a response. It is `null` until a
release is actually published. A client should retain both the Registry version and the response
timestamp when caching a decision.

The production server entry in the current document is illustrative. Phase 7 will replace it only
after a real hostname is configured; it does not claim a deployment exists.

## Future client generation

After the API contract stabilizes, a maintainer may download `/openapi.json` and pass it to a chosen
OpenAPI generator for TypeScript, Dart, PHP, or another client. Do not commit generated clients until
their generator version, command, output location, review process, and update policy are documented.

Public schemas must never add username-availability fields, private review notes, claimant evidence,
administrator identities, rejected evidence, database/account identifiers, secrets, raw SQL errors,
or stack traces. A match remains a protection-risk signal rather than proof of identity.
