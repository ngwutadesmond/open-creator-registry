# Production runbook

Production is a separate, owner-approved gate after staging acceptance. Proposed resources are
Workers `open-creator-registry` and `open-creator-registry-admin`, D1
`open-creator-registry-production`, and binding `DB`.

Required evidence includes the accepted staging commit/version, complete local and staging QA,
current recovery bookmark, reviewed diff/config/secrets, least-privilege Access policies, change
window, rollback owner, incident contact, and confirmation that no demonstration seed will run.

Create production D1 separately and record its UUID outside Git. Never write it into tracked Worker
templates. Materialize and validate the ignored public production manifest, list migrations, record
Time Travel, apply with the guarded production confirmation, validate schema, then deploy the
public Worker. Materialize the separate admin bootstrap/final manifests and deploy the
Access-protected admin Worker through the same staged lifecycle used in staging. Never seed
production. Production records must be sourced from reviewed administrative entry/import processes
and remain subject to provenance, privacy, audit, approval, dispute, and release policies.

Keep Cron empty for the initial release. Enable no connector until source licensing, contact user
agent, scope, dry-run results, alerting, lease recovery, rate limits, and an operator are approved.
Production smoke tests must be read-only. Monitor 4xx/5xx, health/migration readiness, D1 errors,
rate-limit failures, Access events, and scheduled events during the acceptance window.
