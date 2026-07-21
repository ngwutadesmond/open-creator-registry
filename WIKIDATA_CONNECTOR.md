# Wikidata proof-of-concept connector

Wikidata is the only automated connector implemented in Phase 6. The persisted configuration is
disabled, scheduling-disabled, and dry-run by default. Its fixed endpoint is
`https://query.wikidata.org/sparql`, access mode is `official_api`, licence is `CC0-1.0`, and
attribution is recorded as Wikidata contributors.

The query builder accepts only validated Wikidata Q identifiers for occupation and optional
country allowlists plus bounded integer limit/offset values. Arbitrary SPARQL is never accepted by
the API or UI. Results use deterministic item ordering and bounded offset pagination. The POC maps
an English label, selected aliases and description, occupation/country values, official website,
MusicBrainz ID, and valid supported-platform identifiers when present. Missing optional bindings
remain absent. Invalid records are recorded independently; the raw response and full errors are not
stored.

Requests use an identified Open Creator Registry user agent, JSON content-type checks, a 1 MiB
response ceiling, abortable timeouts, bounded transient retries, `Retry-After`, exponential backoff,
and injected sleep/random functions. Tests use `packages/ingestion/src/fixtures.ts`; normal tests and
Playwright make no Wikidata request.

For local fixture use, set `WIKIDATA_FIXTURE_MODE=enabled` only in ignored
`apps/admin/.dev.vars`, restart the Worker, and explicitly enable the source in the admin ingestion
page. The source record remains candidate evidence. A `source_linked` platform association is not
proof of identity or account control.

No automatic live test is provided. A full Wikidata dump or broad worldwide import needs a separate
bulk pipeline, storage/capacity plan, source coordination, and operational review; it does not fit a
single Worker invocation.
