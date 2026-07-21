# Administration imports

Imports are bounded local Registry changes, not an external scraping or connector system. Phase 6
owns scheduled connectors.

## Formats

JSON is one array of records. CSV uses a header row, comma delimiters, RFC-style doubled quotes,
and supports quoted newlines. Every row has `record_type`: `creator`, `source`, `alias`, or
`handle`. Related rows identify a creator with `creator_name`; the creator must already exist or
appear earlier in the same file.

Example JSON:

```json
[
  {
    "record_type": "creator",
    "canonical_name": "Example Demonstration Creator",
    "entity_type": "person",
    "country_codes": ["NG"],
    "notoriety_score": 70,
    "protection_tier": "notable",
    "review_status": "pending"
  }
]
```

Example CSV:

```csv
record_type,canonical_name,entity_type,country_codes,notoriety_score,protection_tier,review_status
creator,Example Demonstration Creator,person,NG,70,notable,pending
```

## Preview and commit

Preview parses and validates all rows, uses the shared normalization and confusable abstraction,
checks local database and in-file duplicates, flags common-name and confusable risks, and stores a
bounded validated payload plus SHA-256 checksum. Parse and row errors are visible before mutation.
Limits are 256 KiB and 500 records.

Commit requires the preview ID and unchanged checksum. Invalid previews cannot commit. D1 applies
the batch, ingestion summary, state transition, and audit record transactionally. Repeating a
completed preview returns the completed batch without duplicate data. Critical creator hard
reservations become pending approval requests instead of live handles.

Duplicate rows are skipped, not overwritten. Confusable similarity is a review warning, never
identity proof. Import summaries report imported, duplicate, invalid, and approval-routed counts.
