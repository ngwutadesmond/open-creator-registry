# Cloudflare resource manifest

Gate A creates no remote resource. This manifest is the naming and ownership proposal for later
operator-approved gates.

| Environment | Public Worker                        | Administration Worker                 | D1 database                        | D1 binding |
| ----------- | ------------------------------------ | ------------------------------------- | ---------------------------------- | ---------- |
| Local       | `open-creator-registry-public-local` | `open-creator-registry-admin-local`   | `open-creator-registry-local`      | `DB`       |
| Staging     | `open-creator-registry-staging`      | `open-creator-registry-admin-staging` | `open-creator-registry-staging`    | `DB`       |
| Production  | `open-creator-registry`              | `open-creator-registry-admin`         | `open-creator-registry-production` | `DB`       |

Staging and production have separate databases. Within one environment, both Workers must contain
the same D1 UUID and bind it only as `DB`. D1 UUIDs and account IDs are operator records and must
not be committed.

Each deployed Worker also declares an `ASSETS` binding and environment-specific rate-limit
bindings. Numeric rate-limit namespace IDs are unique by environment and binding; reusing one would
share counters. Staging and production enable Workers Logs at full head sampling for initial
acceptance. Review cost/volume before reducing production sampling.

No KV, R2, Queue, Durable Object, Vectorize, custom domain, route, Access application, service
token, Cron Trigger, API token, or remote D1 database exists as a result of Gate A.

## Cron proposal

`triggers.crons` remains `[]` in every committed environment. After production data-source,
licence, alerting, lock-recovery, and operator-ownership review, a separate change may propose one
admin-only weekly trigger at `0 3 * * 1` (03:00 UTC Monday). Adding the trigger does not enable a
source: its reviewed D1 configuration must independently set both `enabled` and
`scheduled_enabled`. Public Workers never receive a Cron Trigger.
