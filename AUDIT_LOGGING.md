# Audit logging

Administrative mutations append structured audit entries containing action, entity type and ID,
server-authenticated actor identifier, safe previous/new values where applicable, request ID, and
UTC timestamp. Creator, evidence, handle, review, import, approval, authentication-switch, and
release workflows are covered.

The repository intentionally exposes only `append`, `findById`, `findByEntity`, `list`, and `count`.
There are no audit update or delete methods or API routes. Lists support action, administrator,
entity, entity ID, and UTC date filters with exact pagination totals.

Audit values must exclude secrets, Access tokens, cookies, private credentials, raw SQL, and stack
traces. Public APIs never expose audit records or administrator identifiers. Safe API errors refer
to a request ID; internal details stay in Worker logs.

Phase 5 retains audit entries indefinitely. A production retention/export policy requires owner
and legal review in a later operational phase; it must preserve append-only evidence and dispute
requirements.
Phase 6 audits profile creation/update/suppression and critical approval decisions; source
configuration changes; manual previews/runs; checkpoint resets; and force-released source locks.
Ingestion audit values contain bounded summaries only. They do not include full Wikidata responses,
authentication assertions, secret configuration, or arbitrary page content.
