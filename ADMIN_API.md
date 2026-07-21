# Administration API

## Boundary and documentation

The private API is served by the separate administration Worker at `/api/admin/v1`. Its generated
specification is `/admin-openapi.json` and its Scalar interface is `/admin-docs`. Both require the
same authentication and authorization middleware as the API. Neither path appears in the public
Worker or public OpenAPI document.

Local base URL: `http://localhost:5174/api/admin/v1`.

## Conventions

Successful single-record responses use `{"data": ..., "meta": {"request_id": ..., "timestamp":
...}}`. Lists add `meta.pagination` with page, limit, exact total, total pages, and next/previous
flags. Errors use `error.code`, a safe `error.message`, optional validation `details`, and request
metadata. `X-Request-ID` is returned and a valid incoming UUID is preserved.

Bodies must be JSON, are limited to 300 KiB, and are validated with Zod. Import content is further
limited to 256 KiB and 500 records. SQL stays in prepared repository statements.

## Route groups

- `/health`, `/me`, `/development/identity`
- `/dashboard`
- `/creators`, creator detail, aliases, and sources
- `/reserved-handles`, conflict checking, suspend, release, and restore
- `/candidates` and approve, reject, request-review, and merge actions
- `/submissions` and review, decision, and candidate-conversion actions
- `/imports` preview, commit, list, and detail
- `/ingestion-runs` list and detail
- `/releases` create, calculate, request approval, approve, publish, and withdraw
- `/approval-requests` list, detail, approve, and reject
- `/audit-logs` read-only list and detail

Creator deletion is intentionally absent. Audit update/delete routes do not exist. Critical hard
handle changes and release publication use the approval workflow described in
`APPROVAL_WORKFLOW.md`.

Example:

```bash
curl -sS http://localhost:5174/api/admin/v1/dashboard
curl -sS 'http://localhost:5174/api/admin/v1/creators?page=1&limit=25'
```

These work only with the local provider configured. Production callers must wait for the Phase 7
Cloudflare Access implementation.
