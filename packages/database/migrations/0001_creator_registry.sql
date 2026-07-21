PRAGMA foreign_keys = ON;

CREATE TABLE creator_entities (
  id TEXT PRIMARY KEY,
  canonical_name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  primary_category TEXT,
  country_codes TEXT CHECK (
    country_codes IS NULL OR (json_valid(country_codes) AND json_type(country_codes) = 'array')
  ),
  biography_summary TEXT,
  notoriety_score INTEGER NOT NULL DEFAULT 0 CHECK (notoriety_score BETWEEN 0 AND 100),
  protection_tier TEXT NOT NULL CHECK (
    protection_tier IN ('critical', 'notable', 'watchlist', 'standard')
  ),
  review_status TEXT NOT NULL CHECK (
    review_status IN ('pending', 'approved', 'rejected', 'disputed', 'suspended')
  ),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_creator_entities_normalized_name ON creator_entities(normalized_name);
CREATE INDEX idx_creator_entities_primary_category ON creator_entities(primary_category);
CREATE INDEX idx_creator_entities_protection_tier ON creator_entities(protection_tier);
CREATE INDEX idx_creator_entities_review_status ON creator_entities(review_status);
CREATE INDEX idx_creator_entities_pagination ON creator_entities(created_at DESC, id DESC);

CREATE TABLE creator_sources (
  id TEXT PRIMARY KEY,
  creator_entity_id TEXT NOT NULL,
  source_name TEXT NOT NULL,
  source_entity_id TEXT NOT NULL,
  source_url TEXT,
  source_license TEXT,
  verification_status TEXT NOT NULL CHECK (
    verification_status IN ('pending', 'verified', 'rejected', 'stale')
  ),
  last_checked_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (creator_entity_id) REFERENCES creator_entities(id) ON DELETE RESTRICT,
  UNIQUE (source_name, source_entity_id)
);

CREATE INDEX idx_creator_sources_creator_entity_id ON creator_sources(creator_entity_id);
CREATE INDEX idx_creator_sources_source_name ON creator_sources(source_name);
CREATE INDEX idx_creator_sources_verification_status ON creator_sources(verification_status);

CREATE TABLE creator_aliases (
  id TEXT PRIMARY KEY,
  creator_entity_id TEXT NOT NULL,
  alias TEXT NOT NULL,
  normalized_alias TEXT NOT NULL,
  confusable_skeleton TEXT NOT NULL,
  language TEXT,
  alias_type TEXT NOT NULL CHECK (
    alias_type IN (
      'canonical',
      'stage_name',
      'former_name',
      'transliteration',
      'official_handle',
      'protected_variant',
      'known_alias'
    )
  ),
  confidence_score INTEGER NOT NULL CHECK (confidence_score BETWEEN 0 AND 100),
  source_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (creator_entity_id) REFERENCES creator_entities(id) ON DELETE RESTRICT,
  FOREIGN KEY (source_id) REFERENCES creator_sources(id) ON DELETE SET NULL,
  UNIQUE (creator_entity_id, normalized_alias)
);

CREATE INDEX idx_creator_aliases_normalized_alias ON creator_aliases(normalized_alias);
CREATE INDEX idx_creator_aliases_confusable_skeleton ON creator_aliases(confusable_skeleton);
CREATE INDEX idx_creator_aliases_creator_entity_id ON creator_aliases(creator_entity_id);

CREATE TABLE reserved_handles (
  id TEXT PRIMARY KEY,
  creator_entity_id TEXT NOT NULL,
  display_handle TEXT NOT NULL,
  normalized_handle TEXT NOT NULL UNIQUE,
  confusable_skeleton TEXT NOT NULL,
  classification TEXT NOT NULL CHECK (
    classification IN ('hard_reserved', 'soft_protected', 'monitored', 'not_listed')
  ),
  confidence_score INTEGER NOT NULL CHECK (confidence_score BETWEEN 0 AND 100),
  decision_source TEXT NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'suspended', 'released', 'disputed')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (creator_entity_id) REFERENCES creator_entities(id) ON DELETE RESTRICT
);

CREATE INDEX idx_reserved_handles_confusable_skeleton ON reserved_handles(confusable_skeleton);
CREATE INDEX idx_reserved_handles_creator_entity_id ON reserved_handles(creator_entity_id);
CREATE INDEX idx_reserved_handles_classification ON reserved_handles(classification);
CREATE INDEX idx_reserved_handles_status ON reserved_handles(status);
CREATE INDEX idx_reserved_handles_pagination ON reserved_handles(created_at DESC, id DESC);
