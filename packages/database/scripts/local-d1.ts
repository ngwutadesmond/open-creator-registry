import { spawn } from 'node:child_process';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { Miniflare } from 'miniflare';

import { seedDatabase } from '@open-creator-registry/database/seed';

const repositoryRoot = process.cwd();
const persistenceRoot = path.resolve(repositoryRoot, '.wrangler/state');
const d1PersistencePath = path.resolve(persistenceRoot, 'v3/d1');
const wranglerConfig = path.resolve(repositoryRoot, 'wrangler.database.jsonc');
const localDatabaseName = 'open-creator-registry-local';
const localDatabaseId = 'local-open-creator-registry';
const expectedTables = [
  'audit_logs',
  'creator_aliases',
  'creator_candidates',
  'creator_entities',
  'creator_sources',
  'ingestion_runs',
  'public_submissions',
  'registry_releases',
  'reserved_handles',
] as const;

async function runWrangler(arguments_: string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      path.resolve(repositoryRoot, 'node_modules/.bin/wrangler'),
      [...arguments_, '--local', '--persist-to', persistenceRoot, '--config', wranglerConfig],
      {
        cwd: repositoryRoot,
        env: { ...process.env, WRANGLER_WRITE_LOGS: 'false' },
        stdio: 'inherit',
      },
    );
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Wrangler exited with status ${String(code)}.`));
    });
  });
}

async function withLocalDatabase<T>(callback: (db: D1Database) => Promise<T>): Promise<T> {
  const miniflare = new Miniflare({
    compatibilityDate: '2026-07-21',
    d1Databases: { DB: localDatabaseId },
    d1Persist: d1PersistencePath,
    modules: true,
    script: 'export default { fetch() { return new Response("Local database tooling"); } }',
  });

  try {
    const database = await miniflare.getD1Database('DB');
    return await callback(database);
  } finally {
    await miniflare.dispose();
  }
}

async function migrate(): Promise<void> {
  await runWrangler(['d1', 'migrations', 'apply', localDatabaseName]);
}

async function listMigrations(): Promise<void> {
  await runWrangler(['d1', 'migrations', 'list', localDatabaseName]);
}

async function seed(): Promise<void> {
  const summary = await withLocalDatabase((database) => seedDatabase(database));
  console.log(summary.label);
  console.table({
    creators: summary.creators,
    sources: summary.sources,
    aliases: summary.aliases,
    reserved_handles: summary.reservedHandles,
  });
}

async function validate(): Promise<void> {
  await withLocalDatabase(async (database) => {
    const tableResult = await database
      .prepare(
        `SELECT name FROM sqlite_master
         WHERE type = 'table' AND name NOT LIKE '_cf_%'
           AND name NOT IN ('d1_migrations', 'sqlite_sequence')
         ORDER BY name`,
      )
      .all<{ name: string }>();
    const tables = tableResult.results.map((row) => row.name);
    if (JSON.stringify(tables) !== JSON.stringify(expectedTables)) {
      throw new Error(
        `Schema table mismatch. Expected ${expectedTables.join(', ')}; got ${tables.join(', ')}.`,
      );
    }

    const foreignKeyViolations = await database.prepare('PRAGMA foreign_key_check').all();
    if (foreignKeyViolations.results.length > 0) {
      throw new Error('Foreign-key validation failed.');
    }

    const indexCount = await database
      .prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'index'")
      .first<{ count: number }>();
    if (!indexCount || indexCount.count < 20) {
      throw new Error('Schema validation found fewer indexes than expected.');
    }

    console.log(
      `Schema valid: ${String(tables.length)} tables, ${String(indexCount.count)} indexes, no foreign-key violations.`,
    );
  });
}

async function inspect(): Promise<void> {
  await withLocalDatabase(async (database) => {
    const counts = await database
      .prepare(
        `SELECT
          (SELECT COUNT(*) FROM creator_entities) AS creators,
          (SELECT COUNT(*) FROM creator_aliases) AS aliases,
          (SELECT COUNT(*) FROM creator_sources) AS sources,
          (SELECT COUNT(*) FROM reserved_handles) AS reserved_handles`,
      )
      .first<Record<string, number>>();
    const handles = await database
      .prepare(
        `SELECT display_handle, normalized_handle, classification, status
         FROM reserved_handles ORDER BY created_at, id LIMIT 8`,
      )
      .all<Record<string, string>>();
    console.log('Local demonstration-data counts');
    console.table(counts ? [counts] : []);
    console.log('Representative reserved handles');
    console.table(handles.results);
  });
}

async function reset(): Promise<void> {
  if (path.basename(persistenceRoot) !== 'state' || !persistenceRoot.includes('.wrangler')) {
    throw new Error('Refusing to reset an unexpected persistence directory.');
  }
  await rm(persistenceRoot, { force: true, recursive: true });
  await migrate();
  await seed();
  await validate();
}

const command = process.argv[2];

switch (command) {
  case 'migrate':
    await migrate();
    break;
  case 'list':
    await listMigrations();
    break;
  case 'seed':
    await seed();
    break;
  case 'reset':
    await reset();
    break;
  case 'inspect':
    await inspect();
    break;
  case 'validate':
    await validate();
    break;
  default:
    throw new Error('Expected one command: migrate, list, seed, reset, inspect, or validate.');
}
