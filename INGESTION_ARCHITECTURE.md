# Ingestion architecture

Phase 6 adds a bounded evidence-discovery pipeline. It is not an automatic creator-approval or
handle-reservation system.

```text
scheduled/manual trigger -> source configuration -> lease -> connector page
  -> per-record mapping -> candidate + provenance -> outcome -> checkpoint -> run summary
```

`packages/ingestion` owns source-neutral contracts, the registry, orchestration, scheduling, and
the Wikidata proof of concept. Connectors return mapped candidate evidence; D1 repositories never
receive Wikidata response shapes. Unknown connectors fail safely. MusicBrainz is represented only
by an explicit `not_implemented` descriptor.

Each run is bounded by configured pages, records, retries, failed records, duration, response size,
and request timeout. A source/scope lease is atomically acquired in D1 and can be replaced only
after expiry. Ownership is required for normal release; audited super-administrator permission is
required for force release. Successful pages advance their checkpoint after record processing.
Failed pages retain the last successful cursor.

Records are idempotent by `(source_name, source_entity_id)`. A repeat updates pending candidate
evidence or records a duplicate checksum. A reviewer decision is never overwritten. Profile links
from a connector remain candidate provenance until an administrator intentionally associates them
with an approved creator. No ingestion path creates creators, handles, protection tiers, or releases.

The admin Worker exports Cloudflare's `scheduled()` handler. It selects only configurations where
both `enabled` and `scheduled_enabled` are true, awaits each bounded run, and isolates source
failures. No production Cron Trigger is configured in Phase 6.
