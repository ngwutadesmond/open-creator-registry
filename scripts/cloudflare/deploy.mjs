import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

import {
  argument,
  environmentManifest,
  hasFlag,
  repositoryRoot,
  requireChoice,
  supportedApplications,
  supportedEnvironments,
} from './configuration.mjs';

const application = requireChoice(argument('application'), supportedApplications, 'application');
const environment = requireChoice(argument('environment'), supportedEnvironments, 'environment');
const dryRun = hasFlag('dry-run');
const manifest = await environmentManifest(environment);
const expectedWorkerName = manifest[application].selected.name;

function run(command, args, extraEnvironment = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repositoryRoot,
      env: { ...process.env, ...extraEnvironment },
      stdio: 'inherit',
      shell: false,
    });
    child.once('error', reject);
    child.once('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`${command} exited with status ${code}.`)),
    );
  });
}

await run('node', [
  'scripts/cloudflare/validate-deployment-config.mjs',
  '--environment',
  environment,
]);
await run('npm', ['run', 'build', '--workspace', `@open-creator-registry/${application}`], {
  CLOUDFLARE_ENV: environment,
});

const workerOutput = path.join(repositoryRoot, `apps/${application}/dist`);
const directories = await readdir(workerOutput, { withFileTypes: true });
let configPath;
for (const directory of directories) {
  if (!directory.isDirectory() || directory.name === 'client') continue;
  const candidate = path.join(workerOutput, directory.name, 'wrangler.json');
  try {
    const builtConfiguration = JSON.parse(await readFile(candidate, 'utf8'));
    if (builtConfiguration.name === expectedWorkerName) {
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
await run('npx', ['wrangler', 'deploy', '--config', configPath, ...(dryRun ? ['--dry-run'] : [])]);
