# Cloudflare deployment gate

This document is an operator runbook, not an instruction to deploy automatically. Every command
below must be run from the repository root by an authorised operator. Tracked Wrangler files are
account-neutral templates. Account-specific values are materialized into ignored files under
`.generated/cloudflare`; never edit the templates merely to deploy and never commit account IDs,
D1 IDs, Access audience tags, administrator lists, role mappings, or tokens.

## Gate order

1. Run structural validation. It permits known placeholders and does not approve deployment.
2. Finish the complete local quality gate and obtain owner approval for Gate B staging.
3. Authenticate Wrangler and confirm the account and `workers.dev` subdomain.
4. Create only staging D1, materialize its UUID, migrate, and record the recovery bookmark.
5. Validate, dry-run, and deploy the public Worker independently.
6. Materialize, validate, dry-run, and deploy the admin bootstrap Worker in default-deny mode.
7. Configure Cloudflare Access and admin secrets, then materialize and deploy the final admin
   configuration.
8. Smoke test, inspect observability, and accept staging before separate production approval.

Production must never be provisioned as part of the staging gate. Remote migrations are a distinct
operator action and are intentionally absent from the deployment workflow.

## Structural preflight

Run before authentication or provisioning:

```bash
npm run cloudflare:config:staging
```

Successful output names both staging Workers, D1 `open-creator-registry-staging`, binding `DB`, and
the known unresolved placeholders. It reports `structurally_valid: true` and
`deployment_ready: false`. This command validates separation, disabled Cron/Wikidata, remote
authentication policy, assets, rate limits, and observability. It does not prove that a generated
manifest is deployable.

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

After Gate B approval, list the account's databases without changing them:

```bash
WRANGLER_WRITE_LOGS=false npx wrangler d1 list
```

Stop for owner confirmation if `open-creator-registry-staging` already exists; do not create a
duplicate, reuse it, or delete it automatically. Otherwise create exactly one staging database:

```bash
WRANGLER_WRITE_LOGS=false npx wrangler d1 create open-creator-registry-staging --binding DB
```

Confirm that the command says it will act on remote D1 before continuing. Successful output names
`open-creator-registry-staging` and prints its UUID/configuration. Keep the UUID in the current
operator shell; do not copy it into either tracked Wrangler template. Then run:

```bash
export STAGING_D1_DATABASE_ID='value-copied-from-d1-create'
export OCR_D1_DATABASE_ID="$STAGING_D1_DATABASE_ID"
export OCR_ACCOUNT_SUBDOMAIN='confirmed-workers-dev-account-label'
npm run cloudflare:config:materialize -- --environment staging --target public
npm run cloudflare:config:public:staging
```

Materialization writes only
`.generated/cloudflare/staging/public/deploy/wrangler.json` with mode `0600`. Validation must report
the public Worker/D1 names, no unresolved values, and `deployment_ready: true`; it does not require
Access values. The same ignored manifest is used by D1 tooling, dry-run, and real public deploy.

List pending migrations after the public manifest is validated:

```bash
npm run cloudflare:d1 -- --action list-migrations --environment staging
```

This command must select the ignored public staging manifest and list unapplied migrations without
changing remote state.

## Staging migration safety

Apply only after checking the database name/UUID and all five filenames:

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
Acceptance requires five applied migration names, 21 application tables, 86 indexes, an empty
foreign-key result, the disabled default source configuration, and zero creators, handles,
releases, and submissions before any optional staging seed.

Staging demonstration data is optional and visibly labelled. It is prohibited in production:

```bash
npm run cloudflare:seed:render
npm run cloudflare:d1 -- --action seed-staging --environment staging \
  --confirm "staging:open-creator-registry-staging:${STAGING_D1_DATABASE_ID}"
```

The first command writes ignored `.generated/staging-demo-seed.sql`; the second executes it remotely
only when `--environment staging` is present. Successful output reports D1 execution success. Run
the guarded `validate` action afterward using the same confirmation string.

## Deploy public staging independently

Dry-run and real deployment both consume the previously validated public manifest:

```bash
npm run deploy:public:staging -- --dry-run
npm run deploy:public:staging
```

Each command reports target `public`, environment `staging`, Worker name, selected source/built
manifest, D1 name, unresolved values, and dry-run status without printing the D1 UUID or secrets.
The public command never validates or deploys administration configuration and does not require an
Access team, audience, administrator list, role mapping, or service token.

## Deploy the default-deny admin bootstrap

After the public Worker is healthy, supply the non-secret project contact URL and create the
ignored bootstrap manifest:

```bash
export OCR_PROJECT_CONTACT_URL='https://operator-approved-project-contact-url'
npm run cloudflare:config:materialize -- \
  --environment staging --target admin --phase bootstrap
npm run cloudflare:config:admin:staging:bootstrap
npm run deploy:admin:staging:bootstrap -- --dry-run
npm run deploy:admin:staging:bootstrap
```

Successful validation reports `AUTH_PROVIDER=cloudflare_access`, empty Access team/audience values,
and `deployment_ready: true`. Empty Access configuration deliberately makes application
authentication unavailable; it never enables a local or arbitrary-header identity. Confirm the
deployed hostname returns denial before configuring Access.

## Configure Access and staging secrets

Create the hostname-wide Access application described in `CLOUDFLARE_ACCESS.md`, then collect the
team label and application audience outside Git. Use `wrangler secret put` against the ignored
final manifest; input is read interactively and must never be passed on the command line or stored
in shell history:

```bash
export OCR_ACCESS_TEAM_NAME='confirmed-access-team-label'
export OCR_ACCESS_AUD='confirmed-staging-application-audience'
npm run cloudflare:config:materialize -- \
  --environment staging --target admin --phase final
WRANGLER_WRITE_LOGS=false npx wrangler secret put ADMIN_ALLOWED_EMAILS \
  --config .generated/cloudflare/staging/admin/final/wrangler.json
WRANGLER_WRITE_LOGS=false npx wrangler secret put ADMIN_ROLE_MAPPINGS \
  --config .generated/cloudflare/staging/admin/final/wrangler.json
```

Successful output confirms that each secret was uploaded to
`open-creator-registry-admin-staging`; it never prints the value.

The two `OCR_ADMIN_*_CONFIGURED` flags are presence attestations only; they contain no secret value.
Before final deployment, independently run `wrangler secret list` for the exact generated admin
manifest and confirm both names exist:

```bash
WRANGLER_WRITE_LOGS=false npx wrangler secret list \
  --config .generated/cloudflare/staging/admin/final/wrangler.json
```

The successful list contains the two secret names but no values. Only then export the attestations:

```bash
export OCR_ADMIN_ALLOWED_EMAILS_CONFIGURED=true
export OCR_ADMIN_ROLE_MAPPINGS_CONFIGURED=true
```

## Deploy final admin staging independently

Final validation requires the Access variables and both secret-presence attestations:

```bash
npm run cloudflare:config:admin:staging:final
npm run deploy:admin:staging:final -- --dry-run
npm run deploy:admin:staging:final
```

The compatibility alias `npm run deploy:admin:staging` also means final deployment and therefore
fails without complete Access configuration. Each command builds and deploys only the selected
application. Record the version and URL. The Worker still denies authentication unless JWT,
allowlist, and role mapping all validate.

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
