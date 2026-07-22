import { spawn } from 'node:child_process';

import {
  argument,
  readJsonManifest,
  repositoryRoot,
  requireChoice,
  supportedEnvironments,
} from './configuration.mjs';
import { createDeploymentPlan, validateDeploymentManifest } from './deployment-configuration.mjs';
import { remoteDatabaseArguments, timeTravelInfoArguments } from './remote-d1-arguments.mjs';

const actions = ['list-migrations', 'apply-migrations', 'validate', 'inspect', 'seed-staging'];
const action = requireChoice(argument('action'), actions, 'action');
const environment = requireChoice(argument('environment'), supportedEnvironments, 'environment');
const plan = createDeploymentPlan({
  repositoryRoot,
  environment,
  target: 'public',
  phase: 'deploy',
  dryRun: false,
});
const manifest = await readJsonManifest(plan.sourceManifestPath);
validateDeploymentManifest({
  manifest,
  manifestPath: plan.sourceManifestPath,
  environment,
  target: 'public',
});
const database = manifest.d1_databases.find((binding) => binding.binding === 'DB');
const confirmation = argument('confirm');

function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn('npx', ['wrangler', ...args], {
      cwd: repositoryRoot,
      env: { ...process.env, WRANGLER_WRITE_LOGS: 'false' },
      stdio: 'inherit',
      shell: false,
    });
    child.once('error', reject);
    child.once('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`Wrangler exited with status ${code}.`)),
    );
  });
}

const common = remoteDatabaseArguments({
  databaseName: database.database_name,
  manifestPath: plan.sourceManifestPath,
});
const timeTravelInfo = timeTravelInfoArguments({
  databaseName: database.database_name,
  manifestPath: plan.sourceManifestPath,
});

console.log(`Environment: ${environment}`);
console.log(`Database name: ${database.database_name}`);
console.log(`Manifest: ${plan.sourceManifestPath}`);

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
    await run(['d1', 'time-travel', 'info', ...timeTravelInfo]);
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
      `SELECT COUNT(*) AS table_count FROM sqlite_schema
       WHERE type = 'table' AND name NOT LIKE '_cf_%'
         AND name NOT IN ('d1_migrations', 'sqlite_sequence');
       SELECT COUNT(*) AS index_count FROM sqlite_schema WHERE type = 'index';
       PRAGMA foreign_key_check;
       SELECT name FROM d1_migrations ORDER BY id;
       SELECT COUNT(*) AS source_configuration_count FROM source_configurations;
       SELECT
         (SELECT COUNT(*) FROM creator_entities) AS creator_count,
         (SELECT COUNT(*) FROM reserved_handles) AS reserved_handle_count,
         (SELECT COUNT(*) FROM registry_releases) AS release_count,
         (SELECT COUNT(*) FROM public_submissions) AS submission_count;`,
    ]);
  }
}
