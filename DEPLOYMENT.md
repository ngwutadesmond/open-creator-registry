# Cloudflare deployment gate

This document is an operator runbook, not an instruction to deploy automatically. Gate A prepares
the repository only. Every command below must be run from the repository root by an authorised
operator. Replace configuration placeholders locally, review `git diff`, and never commit account
IDs, D1 IDs, Access audience tags, administrator lists, role mappings, or tokens.

## Gate order

1. Finish the complete local quality gate and commit Gate A.
2. Obtain owner approval for Gate B staging.
3. Authenticate Wrangler, create only staging resources, and record the recovery bookmark.
4. migrate, optionally seed demonstration data, deploy, protect admin with Access, and smoke test.
5. Observe and accept staging before requesting separate production approval.

Production must never be provisioned as part of the staging gate. Remote migrations are a distinct
operator action and are intentionally absent from the deployment workflow.

## Authentication

Run from the repository root:

```bash
WRANGLER_WRITE_LOGS=false npx wrangler login --use-keyring
WRANGLER_WRITE_LOGS=false npx wrangler whoami
```

The first command opens Cloudflare OAuth and stores the credential in the operating-system
keychain. Confirm the displayed account before approving. The second command must show the intended
account. Stop if it does not. CI uses scoped `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`
secrets instead of interactive login. The protected deployment environment must also define the
environment-specific names in `PRODUCTION_SECRETS.md`; the workflow validates them and materializes
the account-neutral configuration only inside its ephemeral runner before building.

## Create and configure staging D1

After Gate B approval, create exactly one staging database:

```bash
WRANGLER_WRITE_LOGS=false npx wrangler d1 create open-creator-registry-staging --binding DB
```

Confirm that the command says it will act on remote D1 before continuing. Successful output names
`open-creator-registry-staging` and prints its UUID/configuration. Copy the UUID into the staging
`DB` entry in both `apps/public/wrangler.jsonc` and `apps/admin/wrangler.jsonc`; do not commit it.
Both entries must be identical. Then run:

```bash
npm run cloudflare:config:staging
npm run cloudflare:d1 -- --action list-migrations --environment staging
```

The first command must report `deployable: true` with the staging Worker/database names. The second
must list unapplied migrations and makes no change.

## Staging migration safety

Export the uncommitted D1 UUID only for the current shell:

```bash
export STAGING_D1_DATABASE_ID='value-copied-from-d1-create'
npm run cloudflare:d1 -- --action apply-migrations --environment staging \
  --confirm "staging:open-creator-registry-staging:${STAGING_D1_DATABASE_ID}"
```

The guard first lists migrations and prints the current Time Travel bookmark, then Wrangler prompts
for migration confirmation. Read every filename and confirm only when it matches the committed
`packages/database/migrations` directory. Wrangler applies each migration transactionally and the
script then lists tables, foreign-key violations, applied migrations, and the system source
configuration count. Stop on any error; do not deploy against a partially verified schema.

Staging demonstration data is optional and visibly labelled. It is prohibited in production:

```bash
npm run cloudflare:seed:render
npm run cloudflare:d1 -- --action seed-staging --environment staging \
  --confirm "staging:open-creator-registry-staging:${STAGING_D1_DATABASE_ID}"
```

The first command writes ignored `.generated/staging-demo-seed.sql`; the second executes it remotely
only when `--environment staging` is present. Successful output reports D1 execution success. Run
the guarded `validate` action afterward using the same confirmation string.

## Configure staging secrets

Complete `PRODUCTION_SECRETS.md` and `CLOUDFLARE_ACCESS.md` before deploying the admin Worker. Use
`wrangler secret put` with `--env staging`; input is read interactively and must never be passed on
the command line or stored in shell history:

```bash
WRANGLER_WRITE_LOGS=false npx wrangler secret put ADMIN_ALLOWED_EMAILS \
  --config apps/admin/wrangler.jsonc --env staging
WRANGLER_WRITE_LOGS=false npx wrangler secret put ADMIN_ROLE_MAPPINGS \
  --config apps/admin/wrangler.jsonc --env staging
```

Successful output confirms that each secret was uploaded to
`open-creator-registry-admin-staging`; it never prints the value.

## Deploy staging

Run a local dry build/config review first:

```bash
npm run cloudflare:config:staging
npm run deploy:public:staging -- --dry-run
npm run deploy:admin:staging -- --dry-run
```

After the operator confirms the D1 UUID, variables, Access audience/team domain, secrets, clean
commit, recovery bookmark, and empty Cron list, deploy separately:

```bash
npm run deploy:public:staging
npm run deploy:admin:staging
```

Each command builds only the selected application, sanitizes the output, validates configuration,
and invokes Wrangler for that built Worker. Successful output includes the deployed Worker name,
version, and URL. Record both version IDs. The admin application still denies API authentication
unless its JWT, allowlist, and role mapping all validate.

## Smoke test staging

Create a short-lived Access service token restricted to this application for edge-boundary checks.
Keep its values in the current shell only:

```bash
export PUBLIC_WORKER_URL='https://open-creator-registry-staging.ACCOUNT_SUBDOMAIN.workers.dev'
export ADMIN_WORKER_URL='https://open-creator-registry-admin-staging.ACCOUNT_SUBDOMAIN.workers.dev'
export CF_ACCESS_CLIENT_ID='value-from-access'
export CF_ACCESS_CLIENT_SECRET='value-from-access'
npm run smoke:staging
```

The script checks public health/pages/API/docs/404s, public/admin route separation, unauthenticated
admin denial, Access service-policy passage to the admin shell, and application-level rejection of
the non-human service identity. It does not mutate data. Successful output ends with
`staging HTTP smoke test passed`.

In a separate human browser Access session, verify `/api/admin/v1/health`, `/api/admin/v1/me`, the
dashboard, `/admin-openapi.json`, and `/admin-docs`; all must succeed without console, network, or
CSP errors. This human check is required because admin roles are intentionally mapped only from a
verified, allowlisted email claim.

## Production boundary

Production repeats these steps only after written approval and staging acceptance, using the
production names and a new D1 database. Never seed production. Keep `triggers.crons` empty for the
initial release. Follow `PRODUCTION.md`, `BACKUP_AND_RECOVERY.md`, and `ROLLBACK.md`.

Official references: [Wrangler commands](https://developers.cloudflare.com/workers/wrangler/commands/),
[D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/), and
[D1 Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/).
