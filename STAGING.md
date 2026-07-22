# Staging runbook

Staging is the only permitted Gate B target and requires explicit owner approval. It uses Workers
`open-creator-registry-staging` and `open-creator-registry-admin-staging`, D1
`open-creator-registry-staging`, and binding `DB`. It must never share a D1 UUID, Access audience,
administrator secret, or rate-limit namespace with production.

Before provisioning, require a clean Gate A commit, complete local gate, approved Cloudflare
account, recorded operator/change window, recovery plan, and reviewed placeholder replacement.
Follow `DEPLOYMENT.md` in order. Stop if `npm run cloudflare:config:staging` does not report
`deployable: true`.

Staging may contain only the repository's clearly labelled fictional demonstration seed or
reviewed test records with no private personal data. Run `npm run cloudflare:seed:render` locally
and the guarded staging-only seed action. Never copy production data into staging.

Acceptance requires public and human-authenticated admin smoke checks, security headers/CORS/CSP,
Access denial, production-like default denial when Access settings are absent, D1 migration
compatibility, documentation interfaces, logs, responsive browser QA, and a recorded rollback
version/bookmark. Keep Cron disabled. Delete/rotate the smoke service token after acceptance.
