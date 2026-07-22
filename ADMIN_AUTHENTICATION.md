# Administration authentication

## Current boundary

The administration application is a separate Worker. Production configuration is deliberately
default-deny: an unconfigured provider returns `401` before a route or database operation runs.
Remote environments use `AUTH_PROVIDER=cloudflare_access` and still deny unless the Access team
domain, audience, administrator allowlist, role mapping, and cryptographically valid assertion all
pass. The whole admin hostname must also be protected as documented in `CLOUDFLARE_ACCESS.md`.

Client-supplied names, email addresses, roles, or identity headers are never trusted. The current
provider abstraction creates identity only from server-side Worker configuration. Tests confirm an
`X-Admin-Email` header cannot change the actor.

## Local setup

Copy the ignored local template and keep both test identities non-production:

```bash
cp apps/admin/.dev.vars.example apps/admin/.dev.vars
npm run dev:admin
```

The template defines a primary and secondary administrator. `DEV_ADMIN_ROLES` and
`DEV_ADMIN_SECONDARY_ROLES` are comma-separated allowlisted roles. The server rejects unknown or
empty roles. The UI switches between the two configured slots with a strict, HTTP-only,
same-site cookie; it cannot submit arbitrary identity values.

Roles are `admin_viewer`, `reviewer`, `editor`, `publisher`, and `super_admin`. Permissions are
centralized in `packages/contracts/src/admin.ts`; route authorization is centralized in
`apps/admin/src/api/authorization.ts`. UI permission gating improves usability but the Worker is
always authoritative.

Local identity switching is available at **Settings** or `POST
/api/admin/v1/development/identity` with `{"slot":"primary"}` or `{"slot":"secondary"}`. It is
disabled unless both `ENVIRONMENT=local` and `AUTH_PROVIDER=local_development` are set.

Never commit `.dev.vars`, real administrator addresses, Access secrets, account identifiers, or
production roles.

The production build command removes Cloudflare's generated local-preview `.dev.vars` copy from
`dist` and verifies that no such file remains. Do not deploy an ad-hoc Vite output that bypasses the
workspace build script.

Access tests use ephemeral keys and cover signatures, issuer/audience/time claims, key rotation,
JWK caching, identity allowlisting, role mapping, configuration failure, and token redaction. No
real JWT is stored in source or test artifacts.
