import { spawn } from 'node:child_process';

import {
  argument,
  environmentManifest,
  repositoryRoot,
  requireChoice,
  supportedEnvironments,
} from './configuration.mjs';

const actions = ['list-migrations', 'apply-migrations', 'validate', 'inspect', 'seed-staging'];
const action = requireChoice(argument('action'), actions, 'action');
const environment = requireChoice(argument('environment'), supportedEnvironments, 'environment');
const manifest = await environmentManifest(environment);
const database = manifest.public.database;
const confirmation = argument('confirm');

if (String(database.database_id).includes('REPLACE_WITH_')) {
  throw new Error('The remote D1 database ID has not been recorded in both Worker configurations.');
}
if (manifest.public.database.database_id !== manifest.admin.database.database_id) {
  throw new Error('Public and admin Workers do not reference the same environment D1 database.');
}

function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn('npx', ['wrangler', ...args], {
      cwd: repositoryRoot,
      env: process.env,
      stdio: 'inherit',
      shell: false,
    });
    child.once('error', reject);
    child.once('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`Wrangler exited with status ${code}.`)),
    );
  });
}

const common = [
  database.database_name,
  '--remote',
  '--config',
  manifest.public.configPath,
  '--env',
  environment,
];

console.log(`Environment: ${environment}`);
console.log(`Database name: ${database.database_name}`);
console.log(`Database ID: ${database.database_id}`);

if (action === 'list-migrations') {
  await run(['d1', 'migrations', 'list', ...common]);
} else if (action === 'inspect') {
  await run(['d1', 'info', database.database_name, '--json']);
} else {
  const expectedConfirmation = `${environment}:${database.database_name}:${database.database_id}`;
  if (confirmation !== expectedConfirmation) {
    throw new Error(`Refusing ${action}. Repeat with --confirm ${expectedConfirmation}`);
  }
  if (action === 'apply-migrations') {
    await run(['d1', 'migrations', 'list', ...common]);
    await run(['d1', 'time-travel', 'info', ...common]);
    await run(['d1', 'migrations', 'apply', ...common]);
  } else if (action === 'seed-staging') {
    if (environment !== 'staging')
      throw new Error('Demonstration seed is forbidden in production.');
    await run(['d1', 'execute', ...common, '--file', '.generated/staging-demo-seed.sql']);
  }
  if (action === 'apply-migrations' || action === 'validate') {
    await run([
      'd1',
      'execute',
      ...common,
      '--command',
      "SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY name; PRAGMA foreign_key_check; SELECT name FROM d1_migrations ORDER BY id; SELECT COUNT(*) AS source_configuration_count FROM source_configurations;",
    ]);
  }
}
