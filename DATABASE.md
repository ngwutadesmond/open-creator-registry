# Database

## Local D1 boundary

Cloudflare D1 is the registry source of truth. Both Workers bind the same database as `DB`, use the
same migration directory, and use the repository-root `.wrangler/state` directory when either
Worker is run on its own. Local development uses the clearly local identifier
`local-open-creator-registry`; it is not a production database ID and cannot be treated as
deployment configuration.

Two independent workerd processes cannot safely own the same persisted local SQLite state at the
same time. The root `npm run dev` shell-smoke command therefore starts the two Phase 1 interfaces
with isolated ignored state under `.wrangler/state/public-shell` and
`.wrangler/state/admin-shell`. No Phase 2 UI reads the database, so this prevents file-lock
contention without changing behavior. Run `npm run dev:public` or `npm run dev:admin` individually
when checking the canonical seeded local database. Production will bind both Workers to one remote
D1 database after that database is created in Phase 7.

No Cloudflare account or login is needed for the commands in this document. Phase 7 will add a
separate authenticated remote configuration after the owner creates a real D1 database. There are
intentionally no remote migration, seed, or reset scripts in Phase 2.

## Migrations

Wrangler applies migrations in filename order from `packages/database/migrations`:

| Migration                      | Purpose                                                       |
| ------------------------------ | ------------------------------------------------------------- |
| `0001_creator_registry.sql`    | Creators, evidence sources, aliases, and reserved handles     |
| `0002_registry_operations.sql` | Candidates, submissions, releases, ingestion runs, audit logs |

Wrangler records applied files in `d1_migrations`. Never edit an applied migration; add the next
numbered SQL file instead.

```bash
npm run db:migrations:list
npm run db:migrate:local
```

Both commands are local-only and use `.wrangler/state/v3/d1` for persistent D1 storage.

## Tables

### `creator_entities`

One reviewed person, group, collective, or other creator entity. Names have a comparison form,
notoriety is constrained to 0–100, and protection/review values are checked against the shared
domain values. Indexes cover normalized name, category, protection tier, review status, and stable
created-time pagination.

### `creator_sources`

Provenance for a creator record. `(source_name, source_entity_id)` is globally unique. Creator,
source-name, and verification-status indexes support evidence review. Deleting a referenced creator
is restricted.

### `creator_aliases`

Known names, stage names, transliterations, official handles, and protected variants. A creator
cannot have the same normalized alias twice. Normalized alias, confusable skeleton, and creator
indexes support exact and risk-signal lookup. Creator deletion is restricted; deleting a source
sets the optional `source_id` to null rather than deleting the alias.

### `reserved_handles`

Registry decisions for exact, protected-variant, and monitored handles. `normalized_handle` is
globally unique, scores are constrained to 0–100, and classification/status values are checked.
Indexes cover skeleton, creator, classification, status, and stable pagination. A `not_listed`
result will normally be inferred from the absence of a matching active record; demonstration data
does not insert a `not_listed` reservation.

### `creator_candidates`

Discovery queue records. `(normalized_name, discovery_source)` prevents duplicate discoveries from
one source. Review-status/discovery-time, name, category, and source indexes support queue work,
filtering, and duplicate detection.

### `public_submissions`

Public creator suggestions. Requested handles and public sources are JSON arrays stored as text.
The submission-status/created-time index supports the review queue.

### `registry_releases`

Versioned registry decision points. Versions are unique, record counts cannot be negative, and
release status is checked. The status/published-time index selects the latest published release.
Publishing uses one D1 `batch()` call to supersede a prior release and publish the draft atomically.

### `ingestion_runs`

Local or future connector-run visibility. All counters are non-negative, status is checked, and
status/source indexes support operational history. Phase 6 adds scheduled ingestion; Phase 2 only
provides the persistence contract.

### `audit_logs`

Append-only mutation evidence. The repository exposes `append`, `findByEntity`, and `list`; it has no
update or delete method. Entity/time and global-time indexes support investigations. Previous,
new, and metadata values are nullable JSON text.

## Retention and foreign keys

Creator-owned aliases, sources, and reservations use `ON DELETE RESTRICT`. Evidence and protection
decisions must not disappear through a cascade. Phase 2 intentionally provides no creator-delete
repository operation. Any future retention workflow must explicitly resolve dependent records and
append an audit entry.

## JSON text policy

D1 stores these structured fields as `TEXT` with `json_valid` checks:

- country-code arrays on creators, candidates, and submissions;
- requested-handle and public-source arrays on submissions;
- previous, new, and metadata values on audit logs.

Repository writes use `serializeJson`; reads use checked `parseJson`, `parseStringArray`, or
`parseRequiredStringArray`. Invalid stored JSON becomes a stable database failure instead of being
silently returned. Arrays use ISO 3166-1 alpha-2 uppercase strings where country codes are supplied.

## IDs and timestamps

Runtime repositories generate UUIDs with Web Crypto `crypto.randomUUID()`. Tests can inject a
`RecordMetadataProvider` for deterministic IDs and time. Seed fixtures use fixed valid UUIDs so
repeated seeding updates the same demonstration records.

All timestamps are UTC ISO-8601 strings. Repository code obtains them from the same injectable
metadata provider.

## Repository conventions

- SQL lives only under `packages/database/src/repositories` or controlled seed/migration modules.
- Every runtime value is bound through a D1 prepared statement.
- Sort fields are TypeScript allowlists; callers cannot provide arbitrary SQL fragments.
- Creator search uses bound values across normalized names, aliases, active handles, and verified
  external source identifiers. Released handles and unverified sources do not create public-search
  associations.
- Find methods return `null` for absence. Mutations targeting a missing record throw a stable
  `not_found` error.
- Unique, constraint, validation, and unexpected D1 failures map to stable application error codes.
- Pagination defaults to 25 and rejects limits above 100.
- Multi-statement atomic work uses D1 `batch()`; D1 executes a batch transactionally.
- Audit repositories remain append-only.

## Demonstration data

The seed label is `LOCAL DEMONSTRATION DATA — NOT AN AUTHORITATIVE REGISTRY`. All people and groups
are fictional and contain no private personal information. The dataset covers a critical musician,
notable video creator, streamer, comedian, visual artist, creator group, regional creator,
common-name safeguard, multi-alias creator, and design collective. It includes exact hard-reserved,
official-style soft-protected, monitored fan/archive, and deliberately absent ordinary-handle
examples.

## Local reset, seed, validation, and inspection

Reset deletes only the guarded repository-root `.wrangler/state` directory, then migrates, seeds,
and validates:

```bash
npm run db:reset:local
```

Run individual steps when needed:

```bash
npm run db:migrate:local
npm run db:seed:local
npm run db:validate
npm run db:inspect:local
```

`db:seed:local` validates the TypeScript fixture with Zod before using prepared D1 statements. It is
idempotent and safe to repeat. `db:validate` checks the expected tables and index count and runs
D1-supported foreign-key validation. D1 intentionally blocks SQLite's `PRAGMA integrity_check`, so
the command does not claim to run that prohibited diagnostic.

Database integration tests use Cloudflare's Vitest pool, Miniflare, the real SQL migration files,
and isolated local D1 storage:

```bash
npm run test:database
```
