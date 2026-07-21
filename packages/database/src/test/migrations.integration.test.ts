import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';

import { createCreatorAliasRepository } from '../repositories/creator-alias-repository';
import { createCreatorSourceRepository } from '../repositories/creator-source-repository';
import { createReservedHandleRepository } from '../repositories/reserved-handle-repository';
import { seedDatabase } from '../seed';
import { clearDatabase, createTestCreator } from './test-utils';

beforeEach(clearDatabase);

describe('D1 migrations and constraints', () => {
  it('applies and records all versioned migrations on a clean D1 database', async () => {
    const migrations = await env.DB.prepare('SELECT name FROM d1_migrations ORDER BY id').all<{
      name: string;
    }>();
    const tables = await env.DB.prepare(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE '_cf_%'
       AND name NOT IN ('d1_migrations', 'sqlite_sequence') ORDER BY name`,
    ).all<{ name: string }>();

    expect(migrations.results.map((row) => row.name)).toEqual([
      '0001_creator_registry.sql',
      '0002_registry_operations.sql',
      '0003_registry_administration.sql',
      '0004_scheduled_ingestion_and_profiles.sql',
    ]);
    expect(tables.results.map((row) => row.name)).toEqual([
      'admin_approval_decisions',
      'admin_approval_requests',
      'admin_mutation_guards',
      'audit_logs',
      'candidate_source_provenance',
      'creator_aliases',
      'creator_candidates',
      'creator_entities',
      'creator_external_profiles',
      'creator_sources',
      'import_batch_errors',
      'import_batches',
      'ingestion_record_outcomes',
      'ingestion_runs',
      'public_submissions',
      'registry_release_snapshots',
      'registry_releases',
      'reserved_handles',
      'source_checkpoints',
      'source_configurations',
      'source_run_locks',
    ]);
  });

  it('creates the expected filtering, duplicate-detection, and pagination indexes', async () => {
    const indexes = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_%' ORDER BY name",
    ).all<{ name: string }>();

    expect(indexes.results.map((row) => row.name)).toEqual(
      expect.arrayContaining([
        'idx_creator_entities_normalized_name',
        'idx_creator_candidates_review_queue',
        'idx_reserved_handles_confusable_skeleton',
        'idx_public_submissions_review_queue',
        'idx_registry_releases_latest',
        'idx_audit_logs_entity',
      ]),
    );
    expect(indexes.results.length).toBeGreaterThanOrEqual(20);
  });

  it('rejects invalid enumeration values and out-of-range scores', async () => {
    const timestamp = '2026-01-01T00:00:00.000Z';
    const invalidTier = env.DB.prepare(
      `INSERT INTO creator_entities (
        id, canonical_name, normalized_name, entity_type, notoriety_score,
        protection_tier, review_status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      'invalid-tier',
      'Invalid',
      'invalid',
      'person',
      50,
      'unknown',
      'approved',
      timestamp,
      timestamp,
    );
    const invalidScore = env.DB.prepare(
      `INSERT INTO creator_entities (
        id, canonical_name, normalized_name, entity_type, notoriety_score,
        protection_tier, review_status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      'invalid-score',
      'Invalid',
      'invalid',
      'person',
      101,
      'notable',
      'approved',
      timestamp,
      timestamp,
    );

    await expect(invalidTier.run()).rejects.toThrow(/CHECK constraint/iu);
    await expect(invalidScore.run()).rejects.toThrow(/CHECK constraint/iu);
  });

  it('rejects invalid alias and reserved-handle confidence scores', async () => {
    const creator = await createTestCreator();
    await expect(
      createCreatorAliasRepository(env.DB).create({
        creatorEntityId: creator.id,
        alias: 'Invalid Confidence Alias',
        aliasType: 'known_alias',
        confidenceScore: -1,
      }),
    ).rejects.toMatchObject({ code: 'constraint_violation' });
    await expect(
      createReservedHandleRepository(env.DB).create({
        creatorEntityId: creator.id,
        displayHandle: 'invalid_confidence_handle',
        classification: 'hard_reserved',
        confidenceScore: 101,
        decisionSource: 'integration_test',
        reason: 'Invalid score used only to exercise the database confidence constraint.',
      }),
    ).rejects.toMatchObject({ code: 'constraint_violation' });
  });

  it('enforces restrictive creator foreign keys for retained evidence', async () => {
    const creator = await createTestCreator();
    await createCreatorAliasRepository(env.DB).create({
      creatorEntityId: creator.id,
      alias: 'Test Alias',
      aliasType: 'known_alias',
      confidenceScore: 90,
    });

    await expect(
      env.DB.prepare('DELETE FROM creator_entities WHERE id = ?').bind(creator.id).run(),
    ).rejects.toThrow(/FOREIGN KEY constraint/iu);
  });

  it('maps unique database failures to stable application errors', async () => {
    const creator = await createTestCreator();
    const aliases = createCreatorAliasRepository(env.DB);
    await aliases.create({
      creatorEntityId: creator.id,
      alias: 'Duplicate Alias',
      aliasType: 'known_alias',
      confidenceScore: 90,
    });

    await expect(
      aliases.create({
        creatorEntityId: creator.id,
        alias: 'duplicate-alias',
        aliasType: 'known_alias',
        confidenceScore: 90,
      }),
    ).rejects.toMatchObject({ code: 'unique_constraint' });
  });

  it('enforces source and normalized-handle uniqueness', async () => {
    const creator = await createTestCreator();
    const sources = createCreatorSourceRepository(env.DB);
    const handles = createReservedHandleRepository(env.DB);
    const sourceInput = {
      creatorEntityId: creator.id,
      sourceName: 'test_source',
      sourceEntityId: 'entity-1',
      verificationStatus: 'verified' as const,
    };
    await sources.create(sourceInput);
    await expect(sources.create(sourceInput)).rejects.toMatchObject({ code: 'unique_constraint' });

    await handles.create({
      creatorEntityId: creator.id,
      displayHandle: 'Unique.Handle',
      classification: 'hard_reserved',
      confidenceScore: 100,
      decisionSource: 'integration_test',
      reason: 'Exact test handle used to verify the global uniqueness constraint.',
    });
    await expect(
      handles.create({
        creatorEntityId: creator.id,
        displayHandle: 'unique-handle',
        classification: 'soft_protected',
        confidenceScore: 90,
        decisionSource: 'integration_test',
        reason: 'Separator-normalized duplicate used to verify the global uniqueness constraint.',
      }),
    ).rejects.toMatchObject({ code: 'unique_constraint' });
  });

  it('rejects negative ingestion counters in actual SQL', async () => {
    const timestamp = '2026-01-01T00:00:00.000Z';
    await expect(
      env.DB.prepare(
        `INSERT INTO ingestion_runs (
          id, source_name, status, imported_count, started_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind('negative-count', 'test', 'pending', -1, timestamp, timestamp, timestamp)
        .run(),
    ).rejects.toThrow(/CHECK constraint/iu);
  });
});

describe('demonstration seed', () => {
  it('validates and inserts the demonstration dataset', async () => {
    const summary = await seedDatabase(env.DB);
    const creatorCount = await env.DB.prepare(
      'SELECT COUNT(*) AS count FROM creator_entities',
    ).first<{
      count: number;
    }>();

    expect(summary.label).toContain('NOT AN AUTHORITATIVE REGISTRY');
    expect(summary.creators).toBe(10);
    expect(creatorCount?.count).toBe(10);
  });

  it('is idempotent and preserves JSON arrays', async () => {
    await seedDatabase(env.DB);
    await seedDatabase(env.DB);
    const creatorCount = await env.DB.prepare(
      'SELECT COUNT(*) AS count FROM creator_entities',
    ).first<{
      count: number;
    }>();
    const creator = await env.DB.prepare(
      "SELECT country_codes FROM creator_entities WHERE normalized_name = 'demo amina bello'",
    ).first<{ country_codes: string }>();
    const ordinaryHandle = await env.DB.prepare(
      "SELECT id FROM reserved_handles WHERE normalized_handle = 'ordinary_unlisted_demo'",
    ).first();

    expect(creatorCount?.count).toBe(10);
    expect(JSON.parse(creator?.country_codes ?? '[]')).toEqual(['NG']);
    expect(ordinaryHandle).toBeNull();
  });
});
