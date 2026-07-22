import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { seedDatabase } from '../src/seed';

type CapturedStatement = { query: string; values: unknown[] };
const captured: CapturedStatement[] = [];

const database = {
  prepare(query: string) {
    return {
      bind(...values: unknown[]) {
        const statement = { query, values };
        captured.push(statement);
        return statement;
      },
    };
  },
  batch() {
    return Promise.resolve([]);
  },
} as unknown as D1Database;

function literal(value: unknown): string {
  if (value === null) return 'NULL';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return `'${value.replaceAll("'", "''")}'`;
  throw new Error(`Unsupported seed value type: ${typeof value}.`);
}

function render(statement: CapturedStatement): string {
  let index = 0;
  const sql = statement.query.replaceAll('?', () => {
    const value = statement.values[index];
    index += 1;
    return literal(value);
  });
  if (index !== statement.values.length) throw new Error('Seed binding count did not match SQL.');
  return `${sql.trim()};`;
}

await seedDatabase(database);
const destination = path.resolve('.generated/staging-demo-seed.sql');
await mkdir(path.dirname(destination), { recursive: true });
await writeFile(
  destination,
  [
    '-- LOCAL/STAGING DEMONSTRATION DATA — NOT AN AUTHORITATIVE REGISTRY',
    '-- Production use of this file is prohibited.',
    'PRAGMA foreign_keys = ON;',
    'BEGIN TRANSACTION;',
    ...captured.map(render),
    'COMMIT;',
    '',
  ].join('\n\n'),
);
console.log(`Generated ${captured.length} idempotent demonstration statements at ${destination}.`);
