# D1 backup and recovery

D1 Time Travel is the primary recovery boundary. Before every remote migration or material data
operation, run the guarded migration command, which calls `d1 time-travel info`, and copy the
current bookmark into the private change record. Confirm `wrangler d1 info DATABASE` reports the
production storage subsystem.

To inspect a bookmark without changing data, run from the repository root:

```bash
WRANGLER_WRITE_LOGS=false npx wrangler d1 time-travel info DATABASE_NAME \
  --config apps/public/wrangler.jsonc --env ENVIRONMENT
```

Expected output identifies the current bookmark and a possible restore command. Do not restore
during diagnosis. Validate Worker/version rollback before deciding that data recovery is required.

A Time Travel restore overwrites the database in place, cancels in-flight queries, and is a
destructive production action. It requires incident/change approval, traffic/mutation containment,
the exact environment/database/bookmark, and a second-person readback:

```bash
WRANGLER_WRITE_LOGS=false npx wrangler d1 time-travel restore DATABASE_NAME \
  --bookmark BOOKMARK --config apps/public/wrangler.jsonc --env ENVIRONMENT
```

Read Wrangler's destructive prompt and confirm only after recording the pre-restore bookmark.
Successful output reports the restored bookmark and an undo bookmark. Immediately validate schema,
foreign keys, source defaults, health, read-only smoke tests, critical record counts, and audit
continuity. Preserve the undo bookmark.

Time Travel retention is plan-dependent and is not a long-term archive. Any future export to R2 or
another store requires separate encryption, access, retention, restore-test, and privacy design.
See [D1 Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/).
