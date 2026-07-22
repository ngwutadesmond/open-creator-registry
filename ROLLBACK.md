# Rollback

Decide whether the incident is code/config-only or data-affecting. Do not restore D1 merely to undo
a Worker regression.

For a code/config rollback, obtain the last accepted Worker version IDs, inspect them in the
Cloudflare dashboard or with `wrangler versions view`, then run one command per Worker from the
repository root:

```bash
WRANGLER_WRITE_LOGS=false npx wrangler rollback VERSION_ID \
  --name WORKER_NAME --message 'INCIDENT_REFERENCE: approved rollback'
```

Wrangler prompts before changing traffic. Confirm the environment, Worker name, and version. Roll
back public and admin independently unless compatibility requires both. Successful output reports
the active rollback deployment. Re-run read-only smoke, headers, Access, health, and docs checks.

Never edit or reverse an applied migration file. If new code remains compatible, roll back the
Worker and leave the schema. For corrupt/incompatible data, contain writes and follow
`BACKUP_AND_RECOVERY.md`; a Time Travel restore is a separate destructive approval. Record every
version, bookmark, command result, health result, and follow-up corrective change.
