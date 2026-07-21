PRAGMA foreign_keys = ON;

CREATE TABLE creator_external_profiles (
  id TEXT PRIMARY KEY,
  creator_entity_id TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (
    platform IN (
      'youtube', 'spotify', 'tiktok', 'instagram', 'x', 'facebook', 'twitch',
      'soundcloud', 'apple_music', 'official_website', 'other'
    )
  ),
  platform_account_id TEXT,
  platform_handle TEXT,
  normalized_platform_handle TEXT,
  profile_url TEXT,
  normalized_profile_url TEXT,
  profile_name TEXT,
  is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0, 1)),
  verification_status TEXT NOT NULL CHECK (
    verification_status IN (
      'unverified', 'source_linked', 'cross_source_confirmed', 'manually_verified',
      'creator_verified', 'stale', 'disputed', 'rejected'
    )
  ),
  visibility_status TEXT NOT NULL CHECK (
    visibility_status IN ('public', 'private', 'suppressed')
  ),
  source_name TEXT NOT NULL,
  source_reference TEXT,
  source_license TEXT,
  confidence_score INTEGER NOT NULL CHECK (confidence_score BETWEEN 0 AND 100),
  connector_version TEXT,
  mapping_version TEXT,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  last_verified_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (creator_entity_id) REFERENCES creator_entities(id) ON DELETE RESTRICT,
  CHECK (
    platform_account_id IS NOT NULL OR platform_handle IS NOT NULL OR profile_url IS NOT NULL
  )
);

CREATE UNIQUE INDEX uq_creator_external_profiles_account
  ON creator_external_profiles(platform, platform_account_id)
  WHERE platform_account_id IS NOT NULL;
CREATE UNIQUE INDEX uq_creator_external_profiles_url
  ON creator_external_profiles(normalized_profile_url)
  WHERE normalized_profile_url IS NOT NULL;
CREATE UNIQUE INDEX uq_creator_external_profiles_primary
  ON creator_external_profiles(creator_entity_id, platform)
  WHERE is_primary = 1;
CREATE INDEX idx_creator_external_profiles_creator
  ON creator_external_profiles(creator_entity_id, platform, created_at, id);
CREATE INDEX idx_creator_external_profiles_public
  ON creator_external_profiles(creator_entity_id, visibility_status, verification_status);
CREATE INDEX idx_creator_external_profiles_handle
  ON creator_external_profiles(platform, normalized_platform_handle);

CREATE TABLE source_configurations (
  source_name TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
  scheduled_enabled INTEGER NOT NULL DEFAULT 0 CHECK (scheduled_enabled IN (0, 1)),
  connector_version TEXT NOT NULL,
  access_mode TEXT NOT NULL CHECK (
    access_mode IN ('open_dataset', 'official_api', 'approved_public_web', 'manual_import')
  ),
  base_url TEXT NOT NULL,
  batch_size INTEGER NOT NULL CHECK (batch_size BETWEEN 1 AND 100),
  maximum_pages_per_run INTEGER NOT NULL CHECK (maximum_pages_per_run BETWEEN 1 AND 10),
  maximum_records_per_run INTEGER NOT NULL CHECK (maximum_records_per_run BETWEEN 1 AND 500),
  timeout_ms INTEGER NOT NULL CHECK (timeout_ms BETWEEN 100 AND 30000),
  retry_count INTEGER NOT NULL CHECK (retry_count BETWEEN 0 AND 5),
  minimum_request_interval_ms INTEGER NOT NULL CHECK (
    minimum_request_interval_ms BETWEEN 0 AND 60000
  ),
  scope_configuration TEXT NOT NULL CHECK (
    json_valid(scope_configuration) AND json_type(scope_configuration) = 'object'
  ),
  candidate_creation_enabled INTEGER NOT NULL DEFAULT 0 CHECK (
    candidate_creation_enabled IN (0, 1)
  ),
  dry_run INTEGER NOT NULL DEFAULT 1 CHECK (dry_run IN (0, 1)),
  source_license TEXT NOT NULL,
  attribution TEXT NOT NULL,
  configuration_status TEXT NOT NULL CHECK (
    configuration_status IN ('valid', 'invalid', 'unavailable')
  ),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_source_configurations_schedule
  ON source_configurations(enabled, scheduled_enabled, source_name);
CREATE INDEX idx_source_configurations_status
  ON source_configurations(configuration_status, source_name);

CREATE TABLE source_checkpoints (
  id TEXT PRIMARY KEY,
  source_name TEXT NOT NULL,
  scope_key TEXT NOT NULL,
  connector_version TEXT NOT NULL,
  cursor TEXT,
  last_source_record_id TEXT,
  last_attempt_at TEXT,
  last_success_at TEXT,
  consecutive_failure_count INTEGER NOT NULL DEFAULT 0 CHECK (consecutive_failure_count >= 0),
  next_allowed_attempt_at TEXT,
  metadata TEXT CHECK (metadata IS NULL OR json_valid(metadata)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (source_name) REFERENCES source_configurations(source_name) ON DELETE RESTRICT,
  UNIQUE (source_name, scope_key)
);

CREATE INDEX idx_source_checkpoints_source
  ON source_checkpoints(source_name, updated_at DESC, id DESC);
CREATE INDEX idx_source_checkpoints_retry
  ON source_checkpoints(next_allowed_attempt_at, source_name, scope_key);

CREATE TABLE source_run_locks (
  source_name TEXT NOT NULL,
  scope_key TEXT NOT NULL,
  run_id TEXT NOT NULL,
  lease_owner TEXT NOT NULL,
  acquired_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  heartbeat_at TEXT NOT NULL,
  PRIMARY KEY (source_name, scope_key),
  FOREIGN KEY (source_name) REFERENCES source_configurations(source_name) ON DELETE RESTRICT
);

CREATE INDEX idx_source_run_locks_expiry ON source_run_locks(expires_at, source_name, scope_key);
CREATE INDEX idx_source_run_locks_run ON source_run_locks(run_id);

ALTER TABLE ingestion_runs ADD COLUMN trigger_type TEXT NOT NULL DEFAULT 'manual' CHECK (
  trigger_type IN ('manual_preview', 'manual', 'scheduled')
);
ALTER TABLE ingestion_runs ADD COLUMN scope_key TEXT NOT NULL DEFAULT 'default';
ALTER TABLE ingestion_runs ADD COLUMN fetched_count INTEGER NOT NULL DEFAULT 0 CHECK (
  fetched_count >= 0
);
ALTER TABLE ingestion_runs ADD COLUMN duplicate_count INTEGER NOT NULL DEFAULT 0 CHECK (
  duplicate_count >= 0
);
ALTER TABLE ingestion_runs ADD COLUMN retry_count INTEGER NOT NULL DEFAULT 0 CHECK (
  retry_count >= 0
);
ALTER TABLE ingestion_runs ADD COLUMN checkpoint_before TEXT CHECK (
  checkpoint_before IS NULL OR json_valid(checkpoint_before)
);
ALTER TABLE ingestion_runs ADD COLUMN checkpoint_after TEXT CHECK (
  checkpoint_after IS NULL OR json_valid(checkpoint_after)
);
ALTER TABLE ingestion_runs ADD COLUMN dry_run INTEGER NOT NULL DEFAULT 0 CHECK (dry_run IN (0, 1));

CREATE INDEX idx_ingestion_runs_trigger_started
  ON ingestion_runs(trigger_type, started_at DESC, id DESC);
CREATE INDEX idx_ingestion_runs_scope_started
  ON ingestion_runs(source_name, scope_key, started_at DESC, id DESC);

CREATE TABLE ingestion_record_outcomes (
  id TEXT PRIMARY KEY,
  ingestion_run_id TEXT NOT NULL,
  source_record_id TEXT,
  idempotency_key TEXT NOT NULL,
  outcome_status TEXT NOT NULL CHECK (
    outcome_status IN ('created', 'updated', 'duplicate', 'skipped', 'failed', 'previewed')
  ),
  candidate_id TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
  error_code TEXT,
  error_message TEXT CHECK (error_message IS NULL OR length(error_message) <= 1000),
  metadata TEXT CHECK (metadata IS NULL OR json_valid(metadata)),
  created_at TEXT NOT NULL,
  FOREIGN KEY (ingestion_run_id) REFERENCES ingestion_runs(id) ON DELETE RESTRICT,
  FOREIGN KEY (candidate_id) REFERENCES creator_candidates(id) ON DELETE RESTRICT,
  UNIQUE (ingestion_run_id, idempotency_key)
);

CREATE INDEX idx_ingestion_record_outcomes_run
  ON ingestion_record_outcomes(ingestion_run_id, created_at, id);
CREATE INDEX idx_ingestion_record_outcomes_candidate
  ON ingestion_record_outcomes(candidate_id, created_at DESC, id DESC);
CREATE INDEX idx_ingestion_record_outcomes_status
  ON ingestion_record_outcomes(outcome_status, created_at DESC, id DESC);

CREATE TABLE candidate_source_provenance (
  id TEXT PRIMARY KEY,
  creator_candidate_id TEXT NOT NULL,
  source_name TEXT NOT NULL,
  source_entity_id TEXT NOT NULL,
  source_url TEXT NOT NULL,
  source_license TEXT NOT NULL,
  connector_version TEXT NOT NULL,
  mapping_version TEXT NOT NULL,
  raw_record_checksum TEXT NOT NULL,
  aliases TEXT NOT NULL CHECK (json_valid(aliases) AND json_type(aliases) = 'array'),
  external_profiles TEXT NOT NULL CHECK (
    json_valid(external_profiles) AND json_type(external_profiles) = 'array'
  ),
  match_recommendation TEXT NOT NULL CHECK (
    match_recommendation IN (
      'no_existing_match', 'likely_existing_creator', 'possible_existing_creator',
      'conflicting_identity', 'manual_review_required'
    )
  ),
  possible_creator_entity_id TEXT,
  warnings TEXT NOT NULL CHECK (json_valid(warnings) AND json_type(warnings) = 'array'),
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  retrieved_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (creator_candidate_id) REFERENCES creator_candidates(id) ON DELETE RESTRICT,
  FOREIGN KEY (possible_creator_entity_id) REFERENCES creator_entities(id) ON DELETE RESTRICT,
  UNIQUE (source_name, source_entity_id)
);

CREATE INDEX idx_candidate_source_provenance_candidate
  ON candidate_source_provenance(creator_candidate_id, last_seen_at DESC, id DESC);
CREATE INDEX idx_candidate_source_provenance_match
  ON candidate_source_provenance(match_recommendation, last_seen_at DESC, id DESC);

CREATE TABLE admin_approval_decisions_backup AS SELECT * FROM admin_approval_decisions;
DROP TABLE admin_approval_decisions;

CREATE TABLE admin_approval_requests_new (
  id TEXT PRIMARY KEY,
  action_type TEXT NOT NULL CHECK (
    action_type IN (
      'handle.create_critical', 'handle.update_critical', 'handle.suspend_critical',
      'handle.release_critical', 'handle.restore_critical', 'release.publish',
      'critical.emergency_override', 'external_profile.create_critical',
      'external_profile.update_critical', 'external_profile.delete_critical'
    )
  ),
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  requested_by TEXT NOT NULL,
  requested_payload TEXT NOT NULL CHECK (json_valid(requested_payload)),
  reason TEXT NOT NULL,
  status TEXT NOT NULL CHECK (
    status IN ('pending', 'approved', 'rejected', 'applied', 'expired', 'invalid')
  ),
  required_approvals INTEGER NOT NULL DEFAULT 1 CHECK (required_approvals > 0),
  approval_count INTEGER NOT NULL DEFAULT 0 CHECK (
    approval_count >= 0 AND approval_count <= required_approvals
  ),
  target_revision TEXT,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  resolved_at TEXT,
  applied_at TEXT
);

INSERT INTO admin_approval_requests_new SELECT * FROM admin_approval_requests;
DROP TABLE admin_approval_requests;
ALTER TABLE admin_approval_requests_new RENAME TO admin_approval_requests;

CREATE INDEX idx_admin_approval_requests_queue
  ON admin_approval_requests(status, created_at DESC, id DESC);
CREATE INDEX idx_admin_approval_requests_entity
  ON admin_approval_requests(entity_type, entity_id, created_at DESC, id DESC);
CREATE INDEX idx_admin_approval_requests_requester
  ON admin_approval_requests(requested_by, created_at DESC, id DESC);

CREATE TABLE admin_approval_decisions (
  id TEXT PRIMARY KEY,
  approval_request_id TEXT NOT NULL,
  administrator_identifier TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('approved', 'rejected')),
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (approval_request_id) REFERENCES admin_approval_requests(id) ON DELETE RESTRICT,
  UNIQUE (approval_request_id, administrator_identifier)
);

INSERT INTO admin_approval_decisions SELECT * FROM admin_approval_decisions_backup;
DROP TABLE admin_approval_decisions_backup;
CREATE INDEX idx_admin_approval_decisions_request
  ON admin_approval_decisions(approval_request_id, created_at, id);
