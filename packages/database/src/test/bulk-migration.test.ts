import path from 'node:path';

import { readD1Migrations } from '@cloudflare/vitest-pool-workers';
import { Miniflare } from 'miniflare';
import { describe, expect, it } from 'vitest';

const migrationNames = [
  '0001_creator_registry.sql',
  '0002_registry_operations.sql',
  '0003_registry_administration.sql',
  '0004_scheduled_ingestion_and_profiles.sql',
  '0005_source_configuration_defaults.sql',
  '0006_public_submission_bulk_safety.sql',
] as const;

describe('bulk-submission migration compatibility', () => {
  it('adds race-safety metadata without rewriting production-like historical submissions', async () => {
    const miniflare = new Miniflare({
      compatibilityDate: '2026-07-21',
      d1Databases: ['DB'],
      modules: true,
      script: 'export default { fetch() { return new Response("test"); } }',
    });
    try {
      const db = await miniflare.getD1Database('DB');
      const migrations = await readD1Migrations(path.resolve('packages/database/migrations'));
      expect(migrations.map(({ name }) => name)).toEqual(migrationNames);
      for (const migration of migrations.slice(0, 5)) {
        await db.batch(migration.queries.map((query) => db.prepare(query)));
      }
      const timestamp = '2026-08-19T12:00:00.000Z';
      const fixtures = [
        ['legacy-pending', 'Legacy Free Text', '["ZZ"]', 'pending'],
        ['legacy-under-review', null, null, 'under_review'],
        ['legacy-approved', 'music', '["NG"]', 'approved'],
        ['legacy-rejected', '', '[]', 'rejected'],
      ] as const;
      for (const [id, category, countries, status] of fixtures) {
        await db
          .prepare(
            `INSERT INTO public_submissions (
              id, creator_name, category, country_codes, requested_handles, public_sources,
              submission_status, created_at, reviewed_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            id,
            `Historical ${id}`,
            category,
            countries,
            '["historical_handle"]',
            '["https://example.test/historical"]',
            status,
            timestamp,
            status === 'pending' ? null : timestamp,
            timestamp,
          )
          .run();
      }
      const before = await db
        .prepare(
          `SELECT id, category, country_codes, submission_status, created_at, reviewed_at, updated_at
           FROM public_submissions ORDER BY id`,
        )
        .all();

      const bulkMigration = migrations[5];
      if (!bulkMigration) throw new Error('Bulk migration was not loaded.');
      await db.batch(bulkMigration.queries.map((query) => db.prepare(query)));

      const after = await db
        .prepare(
          `SELECT id, category, country_codes, submission_status, created_at, reviewed_at, updated_at
           FROM public_submissions ORDER BY id`,
        )
        .all();
      expect(after.results).toEqual(before.results);
      await expect(
        db
          .prepare(
            `SELECT COUNT(*) AS count FROM public_submissions
             WHERE normalized_creator_name IS NOT NULL OR submission_fingerprint IS NOT NULL
               OR batch_reference IS NOT NULL OR batch_row_number IS NOT NULL`,
          )
          .first(),
      ).resolves.toEqual({ count: 0 });
      await expect(
        db.prepare('SELECT COUNT(*) AS count FROM public_submission_batches').first(),
      ).resolves.toEqual({ count: 0 });
    } finally {
      await miniflare.dispose();
    }
  });
});
