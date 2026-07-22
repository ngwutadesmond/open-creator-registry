# Scheduled ingestion

The admin Worker implements an awaited Cloudflare `scheduled()` handler. Gate A deliberately keeps
local, staging, and production Cron arrays empty. The handler selects valid source configurations having
both `enabled` and `scheduled_enabled`, runs each through the same bounded orchestrator used by
manual actions, resumes checkpoints, enforces source locks, and isolates failures.

Local scheduled verification uses two terminals:

```bash
npm run ingestion:serve:local
npm run ingestion:trigger:local
```

The first command starts Wrangler on port 8788 with `--test-scheduled`; the second calls its local
`/__scheduled` endpoint. The dedicated local-only Wrangler configuration omits frontend assets and
contains no Cron Trigger or remote ID. Reset/seed D1 and configure ignored local
administrator/fixture variables first. Inspect results in the admin ingestion page or API. Stop
Wrangler with `Ctrl+C`.

Scheduled runs never approve creators, merge identities, create handles, change protection tiers,
or publish releases. Overlap returns a locked result. Expired leases can be recovered; force release
requires super-administrator permission and an audit reason.

After a separate production approval, the initial proposal is `0 3 * * 1` on the admin Worker only.
Do not add it until observability/alerts, source licence/scope/contact, dry-run evidence, lease
recovery, and an accountable operator are accepted. A trigger never enables a disabled source.
