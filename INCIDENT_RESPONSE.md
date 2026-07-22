# Incident response

1. **Triage:** record UTC time, reporter, environment, affected Worker/version, request IDs, health
   status, Access status, and user impact. Do not copy secrets, assertions, bodies, or private data.
2. **Contain:** disable compromised Access/service/API credentials, pause deployment, keep Cron
   disabled, and if necessary remove source enablement through an audited admin action. Registry
   downtime must not cause consuming platforms to grant suspicious handles.
3. **Preserve evidence:** retain Workers Logs, Access events, audit entries, deployment IDs, D1
   bookmarks, and operator actions under least-privilege access.
4. **Recover:** choose Worker rollback before data restore when possible. Use
   `BACKUP_AND_RECOVERY.md` only with destructive-operation approval.
5. **Validate:** run health, migration, read-only API/docs, Access/default-deny, CORS/security,
   release/version, and relevant data-count checks.
6. **Communicate:** give factual scope/status without creator private data or exploit detail. Route
   vulnerability disclosure through `SECURITY.md`.
7. **Follow up:** rotate exposed values, patch/test, document timeline/root cause, review alert and
   access gaps, and create tracked actions. Never alter append-only audit evidence.

Severity is highest for unauthorised admin access, secret/token exposure, incorrect hard-handle or
release publication, private-data exposure, destructive D1 change, or a fail-open consuming
integration. Two-person approvals and Cloudflare Access remain mandatory during incident pressure.
