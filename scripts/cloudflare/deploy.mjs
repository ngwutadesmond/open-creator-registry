import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

import {
  argument,
  hasFlag,
  readJsonManifest,
  repositoryRoot,
  requireChoice,
  supportedApplications,
  supportedEnvironments,
} from './configuration.mjs';
import {
  createDeploymentPlan,
  deploymentPhases,
  validateDeploymentManifest,
} from './deployment-configuration.mjs';

const application = requireChoice(argument('application'), supportedApplications, 'application');
const environment = requireChoice(argument('environment'), supportedEnvironments, 'environment');
const phase =
  application === 'admin' ? requireChoice(argument('phase'), deploymentPhases, 'phase') : 'deploy';
const dryRun = hasFlag('dry-run');
const plan = createDeploymentPlan({
  repositoryRoot,
  environment,
  target: application,
  phase,
  dryRun,
});
const sourceManifest = await readJsonManifest(plan.sourceManifestPath);
const secretPresence = {
  allowedEmails: process.env.OCR_ADMIN_ALLOWED_EMAILS_CONFIGURED === 'true',
  roleMappings: process.env.OCR_ADMIN_ROLE_MAPPINGS_CONFIGURED === 'true',
};
const validation = validateDeploymentManifest({
  manifest: sourceManifest,
  manifestPath: plan.sourceManifestPath,
  environment,
  target: application,
  phase,
  secretPresence,
});
const expectedWorkerName = validation.worker_name;

function run(command, args, extraEnvironment = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repositoryRoot,
      env: { ...process.env, WRANGLER_WRITE_LOGS: 'false', ...extraEnvironment },
      stdio: 'inherit',
      shell: false,
    });
    child.once('error', reject);
    child.once('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`${command} exited with status ${code}.`)),
    );
  });
}

await run('npm', ['run', 'build', '--workspace', `@open-creator-registry/${application}`], {
  OCR_WRANGLER_CONFIG_PATH: plan.sourceManifestPath,
});

const workerOutput = path.join(repositoryRoot, `apps/${application}/dist`);
const directories = await readdir(workerOutput, { withFileTypes: true });
let configPath;
for (const directory of directories) {
  if (!directory.isDirectory() || directory.name === 'client') continue;
  const candidate = path.join(workerOutput, directory.name, 'wrangler.json');
  try {
    const builtConfiguration = JSON.parse(await readFile(candidate, 'utf8'));
    if (
      builtConfiguration.name === expectedWorkerName &&
      builtConfiguration.d1_databases?.some(
        (binding) =>
          binding.binding === validation.database_binding &&
          binding.database_name === validation.database_name,
      )
    ) {
      configPath = candidate;
      break;
    }
  } catch {
    // Ignore unrelated output directories; the exact expected Worker remains mandatory below.
  }
}
if (!configPath) {
  throw new Error(`No built configuration for Worker ${expectedWorkerName} was found.`);
}
console.log(
  JSON.stringify(
    {
      target: application,
      environment,
      phase,
      worker_name: expectedWorkerName,
      source_manifest: path.relative(repositoryRoot, plan.sourceManifestPath),
      selected_manifest: path.relative(repositoryRoot, configPath),
      database_name: validation.database_name,
      unresolved_values: validation.unresolved_values,
      authentication_mode: validation.authentication_mode,
      dry_run: dryRun,
    },
    null,
    2,
  ),
);
await run('npx', ['wrangler', 'deploy', '--config', configPath, ...(dryRun ? ['--dry-run'] : [])]);
