import {
  applicationConfigurations,
  argument,
  readJsonManifest,
  repositoryRoot,
  requireChoice,
  supportedApplications,
  supportedEnvironments,
} from './configuration.mjs';
import {
  createDeploymentPlan,
  deploymentModes,
  deploymentPhases,
  validateDeploymentManifest,
  validateStructuralConfiguration,
} from './deployment-configuration.mjs';

const environment = requireChoice(argument('environment'), supportedEnvironments, 'environment');
const mode = requireChoice(argument('mode'), deploymentModes, 'mode');

let report;
if (mode === 'structural') {
  report = validateStructuralConfiguration({
    configurations: await applicationConfigurations(),
    environment,
  });
} else {
  const target = requireChoice(argument('target'), supportedApplications, 'target');
  const phase =
    target === 'admin' ? requireChoice(argument('phase'), deploymentPhases, 'phase') : 'deploy';
  const plan = createDeploymentPlan({
    repositoryRoot,
    environment,
    target,
    phase,
    dryRun: false,
  });
  const manifestPath = argument('manifest') ?? plan.sourceManifestPath;
  report = validateDeploymentManifest({
    manifest: await readJsonManifest(manifestPath),
    manifestPath,
    environment,
    target,
    phase,
    secretPresence: {
      allowedEmails: process.env.OCR_ADMIN_ALLOWED_EMAILS_CONFIGURED === 'true',
      roleMappings: process.env.OCR_ADMIN_ROLE_MAPPINGS_CONFIGURED === 'true',
    },
  });
}

console.log(JSON.stringify(report, null, 2));
