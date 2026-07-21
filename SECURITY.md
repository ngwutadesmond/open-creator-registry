# Security policy

## Reporting a vulnerability

Do not publish exploitable details in a public issue. Until a dedicated private disclosure channel
is configured, contact the repository owner privately through the account that publishes this
project and include the affected commit, impact, reproduction steps, and any suggested mitigation.
Do not include real credentials or personal data in a report.

No response-time or bounty commitment exists yet. The owner should acknowledge a credible report,
coordinate a fix and disclosure window, and credit the reporter when requested and safe.

## Phase 4 security boundary

- The public API is unauthenticated by design and exposes only approved creators, verified sources
  and aliases, active public handles, and public release history.
- Public handle explanations are generated from classification/status policy; stored internal
  reservation reasons and decision-source fields are never mapped into responses.
- `not_listed` records are absence classifications and cannot surface as active protected handles,
  make a creator publicly searchable, or inflate active-handle counts.
- The separate admin Worker remains an unimplemented `501` boundary. Phase 5 adds application-level
  validation; Phase 7 protects its entire hostname with Cloudflare Access.
- Zod validates untrusted parameters and bodies. POST bodies are JSON-only and limited to 32 KiB.
- D1 access is repository-owned and uses prepared statements. Sort fields and directions are
  explicit allowlists.
- Valid UUID request IDs may be propagated; all other IDs are replaced. Error logs contain request
  metadata and stable codes, not submissions, SQL text, stack traces, or secrets.
- CORS is an explicit origin allowlist. It is browser policy, not authentication.
- Responses set CSP, clickjacking, MIME-sniffing, referrer, permissions, and transport headers.
- Public POST responses use `no-store`. Read caching is short and documented in `API_USAGE.md`.
- Submission URLs are syntax-checked and stored for later review; the Worker never fetches them, so
  this endpoint cannot be used as an SSRF proxy.
- The local rate limiter is deliberately disabled behind an injectable interface. A real
  distributed limiter and bot protection are Phase 7 deployment requirements.
- The public React bundle contains no secrets, administration routes, SQL, or private record fields.
  Successful and error API bodies are runtime-validated before rendering.
- External source links accept only `http` and `https` protocols and open with
  `noopener noreferrer`. React text rendering is used throughout; the application does not inject
  untrusted HTML.
- Submission data is kept only in component memory for the active page, is not logged, and is not
  persisted to local storage. Client validation improves feedback but never replaces API validation.
- The API tester uses a fixed public GET allowlist; visitors cannot enter an arbitrary URL or invoke
  an administration endpoint through it.

## Operational requirements

- Never commit `.dev.vars`, Wrangler state, D1 files, account IDs, production database IDs, tokens,
  access assertions, or other credentials.
- Treat every value embedded in a Vite client bundle as public.
- Use `npm ci` from the committed lockfile in automation and run `npm audit --omit=dev` before a
  release.
- Configure a real `ALLOWED_ORIGINS` list for each deployed public environment.
- Configure Cloudflare TLS, Access, rate limiting, bot protection, log retention/redaction, and D1
  backups during Phase 7. Do not describe these controls as active before configuration.
- Registry downtime must not grant a suspicious handle. Consuming platforms need a bounded cache,
  a critical-name fallback, and manual review behavior.

The interactive documentation currently loads a pinned Scalar browser bundle from jsDelivr. Its
route-specific nonce-based CSP limits that dependency, and Scalar telemetry, AI, and developer
tools are disabled, but a pinned URL alone is not cryptographic integrity. Self-hosting or a
reviewed integrity mechanism remains a Phase 7 hardening item.
