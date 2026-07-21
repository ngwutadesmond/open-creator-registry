CREATE TABLE creator_candidates (
  id TEXT PRIMARY KEY,
  canonical_name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  category TEXT,
  country_codes TEXT CHECK (
    country_codes IS NULL OR (json_valid(country_codes) AND json_type(country_codes) = 'array')
  ),
  discovery_source TEXT NOT NULL,
  confidence_score INTEGER NOT NULL CHECK (confidence_score BETWEEN 0 AND 100),
  review_status TEXT NOT NULL CHECK (
    review_status IN ('pending', 'approved', 'rejected', 'merged')
  ),
  discovered_at TEXT NOT NULL,
  reviewed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (normalized_name, discovery_source)
);

CREATE INDEX idx_creator_candidates_normalized_name ON creator_candidates(normalized_name);
CREATE INDEX idx_creator_candidates_category ON creator_candidates(category);
CREATE INDEX idx_creator_candidates_discovery_source ON creator_candidates(discovery_source);
CREATE INDEX idx_creator_candidates_review_queue
  ON creator_candidates(review_status, discovered_at DESC, id DESC);

CREATE TABLE public_submissions (
  id TEXT PRIMARY KEY,
  creator_name TEXT NOT NULL,
  category TEXT,
  country_codes TEXT CHECK (
    country_codes IS NULL OR (json_valid(country_codes) AND json_type(country_codes) = 'array')
  ),
  requested_handles TEXT NOT NULL CHECK (
    json_valid(requested_handles) AND json_type(requested_handles) = 'array'
  ),
  public_sources TEXT NOT NULL CHECK (
    json_valid(public_sources) AND json_type(public_sources) = 'array'
  ),
  submission_status TEXT NOT NULL CHECK (
    submission_status IN ('pending', 'under_review', 'approved', 'rejected')
  ),
  created_at TEXT NOT NULL,
  reviewed_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_public_submissions_review_queue
  ON public_submissions(submission_status, created_at DESC, id DESC);

CREATE TABLE registry_releases (
  id TEXT PRIMARY KEY,
  version TEXT NOT NULL UNIQUE,
  record_count INTEGER NOT NULL CHECK (record_count >= 0),
  checksum TEXT NOT NULL,
  release_status TEXT NOT NULL CHECK (
    release_status IN ('draft', 'published', 'superseded', 'withdrawn')
  ),
  published_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_registry_releases_latest
  ON registry_releases(release_status, published_at DESC, created_at DESC, id DESC);

CREATE TABLE ingestion_runs (
  id TEXT PRIMARY KEY,
  source_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (
    status IN ('pending', 'running', 'completed', 'completed_with_errors', 'failed')
  ),
  imported_count INTEGER NOT NULL DEFAULT 0 CHECK (imported_count >= 0),
  updated_count INTEGER NOT NULL DEFAULT 0 CHECK (updated_count >= 0),
  skipped_count INTEGER NOT NULL DEFAULT 0 CHECK (skipped_count >= 0),
  failed_count INTEGER NOT NULL DEFAULT 0 CHECK (failed_count >= 0),
  error_summary TEXT,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_ingestion_runs_status_started
  ON ingestion_runs(status, started_at DESC, id DESC);
CREATE INDEX idx_ingestion_runs_source_started
  ON ingestion_runs(source_name, started_at DESC, id DESC);

CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  actor_identifier TEXT NOT NULL,
  previous_value TEXT CHECK (previous_value IS NULL OR json_valid(previous_value)),
  new_value TEXT CHECK (new_value IS NULL OR json_valid(new_value)),
  metadata TEXT CHECK (metadata IS NULL OR json_valid(metadata)),
  created_at TEXT NOT NULL
);

CREATE INDEX idx_audit_logs_entity
  ON audit_logs(entity_type, entity_id, created_at DESC, id DESC);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at DESC, id DESC);
