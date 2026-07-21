PRAGMA foreign_keys = ON;

CREATE TABLE admin_approval_requests (
  id TEXT PRIMARY KEY,
  action_type TEXT NOT NULL CHECK (
    action_type IN (
      'handle.create_critical',
      'handle.update_critical',
      'handle.suspend_critical',
      'handle.release_critical',
      'handle.restore_critical',
      'release.publish',
      'critical.emergency_override'
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

CREATE INDEX idx_admin_approval_decisions_request
  ON admin_approval_decisions(approval_request_id, created_at, id);

CREATE TABLE import_batches (
  id TEXT PRIMARY KEY,
  format TEXT NOT NULL CHECK (format IN ('csv', 'json')),
  file_name TEXT NOT NULL,
  checksum TEXT NOT NULL,
  status TEXT NOT NULL CHECK (
    status IN ('previewed', 'committing', 'completed', 'completed_with_warnings', 'failed')
  ),
  total_rows INTEGER NOT NULL CHECK (total_rows >= 0),
  valid_rows INTEGER NOT NULL CHECK (valid_rows >= 0),
  invalid_rows INTEGER NOT NULL CHECK (invalid_rows >= 0),
  duplicate_rows INTEGER NOT NULL CHECK (duplicate_rows >= 0),
  warning_rows INTEGER NOT NULL DEFAULT 0 CHECK (warning_rows >= 0),
  validated_payload TEXT NOT NULL CHECK (json_valid(validated_payload)),
  summary TEXT CHECK (summary IS NULL OR json_valid(summary)),
  created_by TEXT NOT NULL,
  committed_by TEXT,
  created_at TEXT NOT NULL,
  committed_at TEXT,
  completed_at TEXT,
  updated_at TEXT NOT NULL,
  UNIQUE (checksum, created_by)
);

CREATE INDEX idx_import_batches_history ON import_batches(created_at DESC, id DESC);
CREATE INDEX idx_import_batches_status ON import_batches(status, created_at DESC, id DESC);

CREATE TABLE import_batch_errors (
  id TEXT PRIMARY KEY,
  import_batch_id TEXT NOT NULL,
  row_number INTEGER NOT NULL CHECK (row_number > 0),
  error_code TEXT NOT NULL,
  error_message TEXT NOT NULL,
  field_name TEXT,
  raw_value TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (import_batch_id) REFERENCES import_batches(id) ON DELETE RESTRICT
);

CREATE INDEX idx_import_batch_errors_batch
  ON import_batch_errors(import_batch_id, row_number, id);

CREATE TABLE registry_release_snapshots (
  id TEXT PRIMARY KEY,
  registry_release_id TEXT NOT NULL UNIQUE,
  snapshot TEXT NOT NULL CHECK (json_valid(snapshot)),
  creator_count INTEGER NOT NULL CHECK (creator_count >= 0),
  active_handle_count INTEGER NOT NULL CHECK (active_handle_count >= 0),
  hard_reserved_count INTEGER NOT NULL CHECK (hard_reserved_count >= 0),
  soft_protected_count INTEGER NOT NULL CHECK (soft_protected_count >= 0),
  monitored_count INTEGER NOT NULL CHECK (monitored_count >= 0),
  checksum TEXT NOT NULL,
  created_by TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  FOREIGN KEY (registry_release_id) REFERENCES registry_releases(id) ON DELETE RESTRICT
);

CREATE INDEX idx_registry_release_snapshots_generated
  ON registry_release_snapshots(generated_at DESC, id DESC);

CREATE TABLE admin_mutation_guards (
  id TEXT PRIMARY KEY,
  valid INTEGER NOT NULL CHECK (valid = 1)
);
