# Contributing

Open an issue before a large change. Keep public and administration Workers separate, preserve the
Registry's classification-not-availability boundary, and never submit real creator private data,
credentials, Access tokens, account/resource IDs, `.dev.vars`, Wrangler state, or browser artifacts.

From the repository root, use Node/npm versions in `.nvmrc`/`package.json`, run `npm ci`, make a
focused change with tests/docs, then run formatting, zero-warning lint, strict type checking, all
relevant Vitest/D1/API/ingestion suites, Playwright, builds, and `npm audit --omit=dev`. UI changes
require rendered desktop/mobile inspection. Migration changes add a new numbered file; never edit
an applied migration. SQL stays in repositories/migrations and all values use prepared bindings.

Security issues follow `SECURITY.md`, not a public exploit report. Data corrections/disputes follow
`CORRECTIONS_AND_DISPUTES.md`. Contributions that add remote provisioning, deployment, migration,
secrets, or schedules need explicit owner approval and an operational runbook.
