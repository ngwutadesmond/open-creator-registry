import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  argument,
  hasFlag,
  readApplicationConfig,
  repositoryRoot,
  requireChoice,
  supportedApplications,
  supportedEnvironments,
} from './configuration.mjs';
import {
  deploymentPhases,
  materializeDeploymentManifest,
  validateDeploymentManifest,
} from './deployment-configuration.mjs';

const environment = requireChoice(argument('environment'), supportedEnvironments, 'environment');
const target = requireChoice(argument('target'), supportedApplications, 'target');
const phase =
  target === 'admin' ? requireChoice(argument('phase'), deploymentPhases, 'phase') : 'deploy';
const dryRun = hasFlag('dry-run');
const { config, configPath } = await readApplicationConfig(target);
const { manifest, outputPath } = materializeDeploymentManifest({
  configuration: config,
  configurationPath: configPath,
  repositoryRoot,
  environment,
  target,
  phase,
  values: process.env,
});
const report = validateDeploymentManifest({
  manifest,
  manifestPath: outputPath,
  environment,
  target,
  phase,
  requireAdminSecrets: false,
});

if (!dryRun) {
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
}

console.log(
  JSON.stringify(
    {
      ...report,
      manifest_path: path.relative(repositoryRoot, outputPath),
      configuration_materialized: !dryRun,
      materialized: !dryRun,
      dry_run: dryRun,
    },
    null,
    2,
  ),
);
