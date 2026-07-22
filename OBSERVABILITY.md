# Observability

Staging and production Wrangler environments enable Workers Logs, custom logs, invocation logs,
and initial head sampling of `1`. Local logging persistence is disabled. The initial production
rate is intentionally conservative for acceptance and must be reviewed for retention, cost, and
traffic volume before any reduction.

HTTP completion logs contain only event name, request ID, route template/path, method, status,
duration, environment, Worker name, and a stable server-error marker. Scheduled logs contain an
ephemeral invocation ID, cron expression, run/source IDs, status, count, duration, environment, and
Worker name. Logs must never contain query/body values, SQL, stack traces, Access assertions,
cookies, secrets, administrator role mappings, or imported records.

Minimum dashboards/alerts after provisioning:

- public/admin `5xx` rate and health readiness;
- `429` and `rate_limit_unavailable` by Worker/route;
- D1 unavailable/outdated migration states;
- Access denial anomalies and service-token expiry;
- scheduled run failures, stuck leases, retries, and missing expected runs after Cron approval;
- latency regression by route and Worker version.

Use the Cloudflare dashboard **Workers & Pages → Worker → Observability** for persisted logs and
Zero Trust Access logs for authentication events. Correlate application and audit entries by
request ID. Set retention and external Logpush only after data-classification review.

See [Workers Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/).
