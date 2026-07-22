# Staging runbook

Staging is the only permitted Gate B target and requires explicit owner approval. It uses Workers
`open-creator-registry-staging` and `open-creator-registry-admin-staging`, D1
`open-creator-registry-staging`, and binding `DB`. It must never share a D1 UUID, Access audience,
administrator secret, or rate-limit namespace with production.

Before provisioning, require a clean reviewed commit, green CI, complete local gate, approved
Cloudflare account, recorded operator/change window, and recovery plan. Follow `DEPLOYMENT.md` in
order. `npm run cloudflare:config:staging` is structural only: it must report
`structurally_valid: true`, known unresolved values, and `deployment_ready: false`. Stop on any
unexpected name, binding, placeholder, production selection, enabled Cron/Wikidata, or auth mode.

The staging lifecycle is: structural preflight; Wrangler login/account confirmation; D1 creation;
ignored public-manifest materialization; migrations; public validation/dry-run/deploy; ignored admin
bootstrap materialization; default-deny admin dry-run/deploy; Access application and secret setup;
ignored admin final materialization; final validation/dry-run/deploy; smoke and log verification;
optional bounded Wikidata validation. Public readiness never depends on admin Access values.
Bootstrap readiness permits them to be empty only because application authentication remains
default-deny. Final readiness requires them and administrator secret presence.

Staging may contain only the repository's clearly labelled fictional demonstration seed or
reviewed test records with no private personal data. Run `npm run cloudflare:seed:render` locally
and the guarded staging-only seed action. Never copy production data into staging.

Acceptance requires public and human-authenticated admin smoke checks, security headers/CORS/CSP,
Access denial, production-like default denial when Access settings are absent, D1 migration
compatibility, documentation interfaces, logs, responsive browser QA, and a recorded rollback
version/bookmark. Keep Cron disabled. Delete/rotate the smoke service token after acceptance.
