# Deployment variables and secrets

Never place values from this document in Git, tickets, screenshots, chat, command arguments, build
artifacts, or Vite variables. Names are documented; values belong in the Cloudflare secret store or
the approved operator/CI secret manager.

## Public Worker variables

Both staging and production require committed, reviewed values for `ENVIRONMENT`, `WORKER_NAME`,
`ALLOWED_ORIGINS`, `APPLICATION_URL`, and `API_DOCUMENTATION_SERVER`. They also require the `DB`,
`ASSETS`, `PUBLIC_HANDLE_CHECK_RATE_LIMITER`, `PUBLIC_BATCH_CHECK_RATE_LIMITER`, and
`PUBLIC_SUBMISSION_RATE_LIMITER` bindings. The D1 UUID is configuration-sensitive and materialized
only into an ignored target manifest.
The public Worker has no application secret.

## Administration Worker variables

Both remote environments require `ENVIRONMENT`, `WORKER_NAME`, `AUTH_PROVIDER=cloudflare_access`,
`ADMIN_ALLOWED_ORIGINS`, `APPLICATION_URL`, `API_DOCUMENTATION_SERVER`,
`CLOUDFLARE_ACCESS_TEAM_DOMAIN`, `CLOUDFLARE_ACCESS_AUD`, `WIKIDATA_FIXTURE_MODE=disabled`, and
`WIKIDATA_USER_AGENT`. Bindings are `DB`, `ASSETS`, `ADMIN_AUTH_FAILURE_RATE_LIMITER`,
`ADMIN_MUTATION_RATE_LIMITER`, and `ADMIN_INGESTION_RATE_LIMITER`.

The admin Worker secrets are:

- `ADMIN_ALLOWED_EMAILS`: comma-separated approved human identities.
- `ADMIN_ROLE_MAPPINGS`: JSON mapping of those identities to least-privilege roles.

Set them interactively with `wrangler secret put` as shown in `DEPLOYMENT.md`. Never use `--var` for
these values.

Admin bootstrap contains neither secret and keeps Access team/audience empty, so it remains
default-deny. Final readiness uses `OCR_ADMIN_ALLOWED_EMAILS_CONFIGURED=true` and
`OCR_ADMIN_ROLE_MAPPINGS_CONFIGURED=true` only as non-secret operator attestations after
`wrangler secret list` confirms both names. The flags never substitute for uploading the secrets.

## Operator and CI secrets

- `CLOUDFLARE_API_TOKEN`: narrowly scoped deployment token; prefer separate staging/production
  environment secrets and protected GitHub environments.
- `CLOUDFLARE_ACCOUNT_ID`: CI deployment context; never expose to a client bundle or commit it.
- `D1_DATABASE_ID`: environment-specific D1 UUID materialized only in the protected CI runner.
- `CLOUDFLARE_ACCESS_AUD`: environment-specific Access audience materialized only in the protected
  CI runner.
- `ACCOUNT_SUBDOMAIN`, `CLOUDFLARE_ACCESS_TEAM_NAME`, and `PROJECT_CONTACT_URL`: protected GitHub
  environment variables used to materialize account-neutral configuration in the CI runner.
- `CF_ACCESS_CLIENT_ID` and `CF_ACCESS_CLIENT_SECRET`: short-lived staging smoke service token,
  stored only in the operator shell/approved secret manager.
- `PUBLIC_WORKER_URL` and `ADMIN_WORKER_URL`: environment URLs used by smoke scripts; not secrets,
  but still environment-owned configuration.

Local materialization uses the equivalent names `OCR_D1_DATABASE_ID`, `OCR_ACCOUNT_SUBDOMAIN`,
`OCR_PROJECT_CONTACT_URL`, `OCR_ACCESS_TEAM_NAME`, and `OCR_ACCESS_AUD`. Keep them in the current
operator shell or approved secret manager; generated manifests stay under ignored
`.generated/cloudflare` and use file mode `0600`.

Do not create a generic `API_TOKEN`, reuse an interactive OAuth credential in CI, or grant D1,
Workers, Access, or account permissions not required by the operation. Rotate/revoke a value after
suspected disclosure and preserve the incident timeline without copying the secret into logs.
