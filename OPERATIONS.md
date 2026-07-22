# Operations

## Routine checks

- Check public and authenticated admin health. A non-`ok` result blocks deployment/traffic
  acceptance; it reports database, migration, authentication, and scheduled-ingestion readiness.
- Review Workers Logs by `request_id`, Worker, route, status, duration, environment, and stable
  error event. Never search for or copy bodies/tokens.
- Review Cloudflare Access authentication events and administrator audit logs separately.
- Review D1 migration list before every build promotion and after every remote migration.
- Review rate-limited (`429`) and fail-closed (`503 rate_limit_unavailable`) trends.

## Change control

Use one operator for execution and another for production confirmation where possible. Record the
commit, Worker version IDs, D1 name/UUID in the private operations record, pre-change Time Travel
bookmark, start/end time, smoke result, and rollback decision. Remote migrations and deployments
are distinct confirmations. Do not put private identifiers in Git.

The GitHub deployment workflow is manual-only, has typed environment/target/phase inputs plus an
exact `deploy-ENVIRONMENT-TARGET-PHASE` confirmation, and deploys one generated manifest. Public,
admin bootstrap, and admin final are separate workflow invocations; the workflow does not run
migrations. Protect staging and production GitHub environments with reviewers. Production must not
reuse the staging API token.

## Scheduled ingestion

Cron remains disabled. If later approved, configure only the admin Worker and start with the weekly
`0 3 * * 1` proposal. Keep each source independently disabled until reviewed. Watch run duration,
failure/retry counts, checkpoint movement, lease ownership, and candidate-only results. A schedule
must never approve or publish data.

## Maintenance

Run `npm audit --omit=dev`, CI, OpenAPI validation, browser workflows, and builds before each
release. Dependabot proposes weekly npm and GitHub Actions updates; review and test them normally.
Rotate Access/service/API credentials on role changes, expiration, or suspicion of exposure.
