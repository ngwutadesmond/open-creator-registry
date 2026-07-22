import path from 'node:path';
import { URL } from 'node:url';

export const deploymentModes = ['structural', 'deploy'];
export const deploymentPhases = ['bootstrap', 'final'];
export const placeholderPattern = /REPLACE_WITH_[A-Z0-9_]+/gu;

export const deploymentExpectations = {
  staging: {
    database: 'open-creator-registry-staging',
    publicWorker: 'open-creator-registry-staging',
    adminWorker: 'open-creator-registry-admin-staging',
    databasePlaceholder: 'REPLACE_WITH_STAGING_D1_ID',
    accessAudiencePlaceholder: 'REPLACE_WITH_STAGING_ACCESS_AUD',
    rateLimits: {
      public: ['1001', '1002', '1003'],
      admin: ['1004', '1005', '1006'],
    },
  },
  production: {
    database: 'open-creator-registry-production',
    publicWorker: 'open-creator-registry',
    adminWorker: 'open-creator-registry-admin',
    databasePlaceholder: 'REPLACE_WITH_PRODUCTION_D1_ID',
    accessAudiencePlaceholder: 'REPLACE_WITH_PRODUCTION_ACCESS_AUD',
    rateLimits: {
      public: ['2001', '2002', '2003'],
      admin: ['2004', '2005', '2006'],
    },
  },
};

const sharedPlaceholders = [
  'REPLACE_WITH_ACCOUNT_SUBDOMAIN',
  'REPLACE_WITH_TEAM_NAME',
  'REPLACE_WITH_PROJECT_CONTACT_URL',
];

export class DeploymentConfigurationError extends Error {
  constructor(environment, mode, failures) {
    super(`Cloudflare ${environment} ${mode} validation failed: ${failures.join(', ')}.`);
    this.name = 'DeploymentConfigurationError';
    this.failures = failures;
  }
}

export function unresolvedValues(value) {
  return [...new Set(JSON.stringify(value).match(placeholderPattern) ?? [])].sort();
}

export function expectedTemplatePlaceholders(environment) {
  const expected = deploymentExpectations[environment];
  if (!expected) throw new Error(`Unsupported environment: ${environment}.`);
  return [
    ...sharedPlaceholders,
    expected.databasePlaceholder,
    expected.accessAudiencePlaceholder,
  ].sort();
}

function dbBinding(selected) {
  return selected?.d1_databases?.find((binding) => binding.binding === 'DB');
}

function hasLocalIdentityConfiguration(selected) {
  return Object.keys(selected?.vars ?? {}).some(
    (name) => name.startsWith('DEV_ADMIN_') || name === 'ADMIN_IDENTITY_HEADER',
  );
}

function validateRemoteSafety(selected, application, failures) {
  if (selected?.vars?.ENVIRONMENT === 'local') failures.push(`${application} local environment`);
  if ((selected?.triggers?.crons ?? []).length !== 0) failures.push(`${application} Cron policy`);
  if (!selected?.observability?.enabled) failures.push(`${application} observability`);
  if (selected?.assets?.binding !== 'ASSETS' || selected?.assets?.run_worker_first !== true) {
    failures.push(`${application} static asset binding`);
  }
}

function validateRateLimits(selected, application, environment, failures) {
  const expectedNames =
    application === 'public'
      ? [
          'PUBLIC_HANDLE_CHECK_RATE_LIMITER',
          'PUBLIC_BATCH_CHECK_RATE_LIMITER',
          'PUBLIC_SUBMISSION_RATE_LIMITER',
        ]
      : [
          'ADMIN_AUTH_FAILURE_RATE_LIMITER',
          'ADMIN_MUTATION_RATE_LIMITER',
          'ADMIN_INGESTION_RATE_LIMITER',
        ];
  const rateLimits = selected?.ratelimits ?? [];
  const actualNames = rateLimits.map(({ name }) => name).sort();
  const actualNamespaces = rateLimits.map(({ namespace_id: namespaceId }) => namespaceId).sort();
  const expectedNamespaces = deploymentExpectations[environment].rateLimits[application].toSorted();
  if (JSON.stringify(actualNames) !== JSON.stringify(expectedNames.toSorted())) {
    failures.push(`${application} rate-limit bindings`);
  }
  if (JSON.stringify(actualNamespaces) !== JSON.stringify(expectedNamespaces)) {
    failures.push(`${application} rate-limit namespaces`);
  }
  if (
    rateLimits.some(
      ({ simple }) =>
        !Number.isInteger(simple?.limit) ||
        simple.limit <= 0 ||
        !Number.isInteger(simple?.period) ||
        simple.period <= 0,
    )
  ) {
    failures.push(`${application} rate-limit policy`);
  }
}

export function validateStructuralConfiguration({ configurations, environment }) {
  const expected = deploymentExpectations[environment];
  if (!expected) throw new Error(`Unsupported environment: ${environment}.`);
  const publicConfiguration = configurations.public;
  const adminConfiguration = configurations.admin;
  const publicSelected = publicConfiguration?.config?.env?.[environment];
  const adminSelected = adminConfiguration?.config?.env?.[environment];
  const publicDatabase = dbBinding(publicSelected);
  const adminDatabase = dbBinding(adminSelected);
  const failures = [];

  if (!publicSelected) failures.push('public environment configuration');
  if (!adminSelected) failures.push('admin environment configuration');
  if (publicConfiguration?.configPath === adminConfiguration?.configPath) {
    failures.push('public/admin manifest separation');
  }
  if (publicSelected?.name !== expected.publicWorker) failures.push('public Worker name');
  if (adminSelected?.name !== expected.adminWorker) failures.push('admin Worker name');
  if (publicSelected?.name === adminSelected?.name) failures.push('public/admin Worker collision');
  if (publicSelected?.vars?.WORKER_NAME !== expected.publicWorker) {
    failures.push('public WORKER_NAME');
  }
  if (adminSelected?.vars?.WORKER_NAME !== expected.adminWorker) {
    failures.push('admin WORKER_NAME');
  }
  if (publicSelected?.vars?.ENVIRONMENT !== environment) failures.push('public environment');
  if (adminSelected?.vars?.ENVIRONMENT !== environment) failures.push('admin environment');
  if (publicSelected?.d1_databases?.length !== 1 || publicDatabase?.binding !== 'DB') {
    failures.push('public DB binding');
  }
  if (adminSelected?.d1_databases?.length !== 1 || adminDatabase?.binding !== 'DB') {
    failures.push('admin DB binding');
  }
  if (publicDatabase?.database_name !== expected.database) failures.push('public D1 name');
  if (adminDatabase?.database_name !== expected.database) failures.push('admin D1 name');
  if (publicDatabase?.database_id !== adminDatabase?.database_id) {
    failures.push('public/admin D1 ID mismatch');
  }
  if (adminSelected?.vars?.AUTH_PROVIDER !== 'cloudflare_access') {
    failures.push('admin AUTH_PROVIDER');
  }
  if (hasLocalIdentityConfiguration(adminSelected)) failures.push('admin local identity fallback');
  if (adminSelected?.vars?.WIKIDATA_FIXTURE_MODE !== 'disabled') {
    failures.push('Wikidata fixture mode');
  }
  validateRemoteSafety(publicSelected, 'public', failures);
  validateRemoteSafety(adminSelected, 'admin', failures);
  validateRateLimits(publicSelected, 'public', environment, failures);
  validateRateLimits(adminSelected, 'admin', environment, failures);

  const publicProduction = publicConfiguration?.config?.env?.production;
  const adminProduction = adminConfiguration?.config?.env?.production;
  const productionPublicDatabase = dbBinding(publicProduction);
  const productionAdminDatabase = dbBinding(adminProduction);
  if (environment === 'staging') {
    if (publicSelected?.name === publicProduction?.name) failures.push('public staging/production');
    if (adminSelected?.name === adminProduction?.name) failures.push('admin staging/production');
    if (publicDatabase?.database_name === productionPublicDatabase?.database_name) {
      failures.push('public staging/production D1 collision');
    }
    if (adminDatabase?.database_name === productionAdminDatabase?.database_name) {
      failures.push('admin staging/production D1 collision');
    }
    if (
      publicDatabase?.database_id &&
      !String(publicDatabase.database_id).includes('REPLACE_WITH_') &&
      publicDatabase.database_id === productionPublicDatabase?.database_id
    ) {
      failures.push('public staging/production D1 ID collision');
    }
  }

  const unresolved = unresolvedValues([publicSelected, adminSelected]);
  const expectedUnresolved = expectedTemplatePlaceholders(environment);
  if (JSON.stringify(unresolved) !== JSON.stringify(expectedUnresolved)) {
    failures.push('unknown or missing template placeholders');
  }
  if (failures.length > 0) {
    throw new DeploymentConfigurationError(environment, 'structural', failures);
  }

  return {
    mode: 'structural',
    environment,
    public_worker: publicSelected.name,
    admin_worker: adminSelected.name,
    database_name: publicDatabase.database_name,
    database_binding: publicDatabase.binding,
    unresolved_values: unresolved,
    structurally_valid: true,
    deployment_ready: false,
  };
}

function validDatabaseId(value) {
  return typeof value === 'string' && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/u.test(value);
}

function validAccountLabel(value) {
  return typeof value === 'string' && /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u.test(value);
}

function validHttpsUrl(value) {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

export function validateDeploymentManifest({
  manifest,
  environment,
  target,
  phase = target === 'admin' ? 'final' : 'deploy',
  manifestPath,
  secretPresence = {},
  requireAdminSecrets = true,
}) {
  const expected = deploymentExpectations[environment];
  if (!expected) throw new Error(`Unsupported environment: ${environment}.`);
  const workerName = target === 'public' ? expected.publicWorker : expected.adminWorker;
  const database = dbBinding(manifest);
  const failures = [];
  const unresolved = unresolvedValues(manifest);

  if (manifest.env) failures.push('generated manifest contains environment alternatives');
  if (manifest.name !== workerName) failures.push(`${target} Worker name`);
  if (manifest.vars?.ENVIRONMENT !== environment) failures.push(`${target} environment`);
  if (manifest.vars?.WORKER_NAME !== workerName) failures.push(`${target} WORKER_NAME`);
  if (manifest.d1_databases?.length !== 1 || database?.binding !== 'DB') {
    failures.push(`${target} DB binding`);
  }
  if (database?.database_name !== expected.database) failures.push(`${target} D1 name`);
  if (!validDatabaseId(database?.database_id)) failures.push(`${target} D1 ID`);
  if (unresolved.length > 0) failures.push(`${target} unresolved deployment values`);
  validateRemoteSafety(manifest, target, failures);
  validateRateLimits(manifest, target, environment, failures);

  const applicationUrl = manifest.vars?.APPLICATION_URL;
  const documentationUrl = manifest.vars?.API_DOCUMENTATION_SERVER;
  if (!validHttpsUrl(applicationUrl)) failures.push(`${target} application URL`);
  if (!validHttpsUrl(documentationUrl)) failures.push(`${target} documentation URL`);
  const hostname = validHttpsUrl(applicationUrl) ? new URL(applicationUrl).hostname : '';
  const accountLabel = hostname.split('.').at(-3);
  if (!validAccountLabel(accountLabel)) failures.push(`${target} workers.dev account subdomain`);

  if (target === 'public') {
    if (manifest.vars?.ALLOWED_ORIGINS !== applicationUrl) failures.push('public CORS origin');
    if (
      Object.keys(manifest.vars ?? {}).some(
        (name) => name.startsWith('CLOUDFLARE_ACCESS_') || name.startsWith('ADMIN_'),
      )
    ) {
      failures.push('public administration configuration');
    }
  } else {
    if (manifest.vars?.ADMIN_ALLOWED_ORIGINS !== applicationUrl) {
      failures.push('admin CORS origin');
    }
    if (manifest.vars?.AUTH_PROVIDER !== 'cloudflare_access') failures.push('admin AUTH_PROVIDER');
    if (hasLocalIdentityConfiguration(manifest)) failures.push('admin local identity fallback');
    if (manifest.vars?.WIKIDATA_FIXTURE_MODE !== 'disabled') {
      failures.push('Wikidata fixture mode');
    }
    if (!validHttpsUrl(manifest.vars?.WIKIDATA_USER_AGENT?.match(/\((https:[^)]+)\)/u)?.[1])) {
      failures.push('admin project contact URL');
    }
    if (phase === 'bootstrap') {
      if (manifest.vars?.CLOUDFLARE_ACCESS_TEAM_DOMAIN) {
        failures.push('bootstrap Access team domain must be empty');
      }
      if (manifest.vars?.CLOUDFLARE_ACCESS_AUD) {
        failures.push('bootstrap Access audience must be empty');
      }
    } else if (phase === 'final') {
      const teamDomain = manifest.vars?.CLOUDFLARE_ACCESS_TEAM_DOMAIN;
      if (
        !validHttpsUrl(teamDomain) ||
        new URL(teamDomain).hostname.split('.').slice(-2).join('.') !== 'cloudflareaccess.com'
      ) {
        failures.push('admin Access team domain');
      }
      if (!/^[A-Za-z0-9_-]{10,256}$/u.test(manifest.vars?.CLOUDFLARE_ACCESS_AUD ?? '')) {
        failures.push('admin Access audience');
      }
      if (requireAdminSecrets && secretPresence.allowedEmails !== true) {
        failures.push('ADMIN_ALLOWED_EMAILS presence');
      }
      if (requireAdminSecrets && secretPresence.roleMappings !== true) {
        failures.push('ADMIN_ROLE_MAPPINGS presence');
      }
    } else {
      failures.push('admin deployment phase');
    }
  }

  if (failures.length > 0) {
    throw new DeploymentConfigurationError(environment, `${target} ${phase}`, failures);
  }
  return {
    mode: 'deploy',
    environment,
    target,
    phase,
    worker_name: manifest.name,
    manifest_path: manifestPath,
    database_name: database.database_name,
    database_binding: database.binding,
    unresolved_values: unresolved,
    authentication_mode: target === 'admin' ? manifest.vars.AUTH_PROVIDER : 'public',
    deployment_ready: !(target === 'admin' && phase === 'final' && !requireAdminSecrets),
  };
}

function replaceAll(source, replacements) {
  let output = source;
  for (const [placeholder, value] of Object.entries(replacements)) {
    output = output.replaceAll(placeholder, value);
  }
  return output;
}

function requireValue(values, name) {
  const value = values[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

export function generatedManifestPath(repositoryRoot, environment, target, phase) {
  const resolvedPhase = target === 'public' ? 'deploy' : phase;
  return path.join(
    repositoryRoot,
    '.generated',
    'cloudflare',
    environment,
    target,
    resolvedPhase,
    'wrangler.json',
  );
}

export function materializeDeploymentManifest({
  configuration,
  configurationPath,
  repositoryRoot,
  environment,
  target,
  phase = target === 'admin' ? 'final' : 'deploy',
  values,
}) {
  const expected = deploymentExpectations[environment];
  const selected = cloneJson(configuration.env?.[environment]);
  if (!expected || !selected) throw new Error(`Missing ${target} ${environment} template.`);
  const databaseId = requireValue(values, 'OCR_D1_DATABASE_ID');
  const accountSubdomain = requireValue(values, 'OCR_ACCOUNT_SUBDOMAIN');
  if (!validDatabaseId(databaseId)) {
    throw new Error('OCR_D1_DATABASE_ID must be a canonical lowercase UUID.');
  }
  if (!validAccountLabel(accountSubdomain)) {
    throw new Error('OCR_ACCOUNT_SUBDOMAIN must be a valid workers.dev account label.');
  }

  const replacements = {
    REPLACE_WITH_ACCOUNT_SUBDOMAIN: accountSubdomain,
    [expected.databasePlaceholder]: databaseId,
  };
  if (target === 'admin') {
    const projectContactUrl = requireValue(values, 'OCR_PROJECT_CONTACT_URL');
    if (!validHttpsUrl(projectContactUrl)) {
      throw new Error('OCR_PROJECT_CONTACT_URL must use HTTPS.');
    }
    replacements.REPLACE_WITH_PROJECT_CONTACT_URL = projectContactUrl;
    if (phase === 'bootstrap') {
      replacements.REPLACE_WITH_TEAM_NAME = '';
      replacements[expected.accessAudiencePlaceholder] = '';
    } else if (phase === 'final') {
      const accessTeamName = requireValue(values, 'OCR_ACCESS_TEAM_NAME');
      const accessAudience = requireValue(values, 'OCR_ACCESS_AUD');
      if (!validAccountLabel(accessTeamName)) {
        throw new Error('OCR_ACCESS_TEAM_NAME must be a valid Cloudflare Access team label.');
      }
      if (!/^[A-Za-z0-9_-]{10,256}$/u.test(accessAudience)) {
        throw new Error('OCR_ACCESS_AUD must be a bounded Access audience value.');
      }
      replacements.REPLACE_WITH_TEAM_NAME = accessTeamName;
      replacements[expected.accessAudiencePlaceholder] = accessAudience;
    } else {
      throw new Error('Admin phase must be bootstrap or final.');
    }
  }

  const materialized = JSON.parse(replaceAll(JSON.stringify(selected), replacements));
  if (target === 'admin' && phase === 'bootstrap') {
    materialized.vars.CLOUDFLARE_ACCESS_TEAM_DOMAIN = '';
    materialized.vars.CLOUDFLARE_ACCESS_AUD = '';
  }
  const outputPath = generatedManifestPath(repositoryRoot, environment, target, phase);
  const outputDirectory = path.dirname(outputPath);
  const templateDirectory = path.dirname(configurationPath);
  const inherited = cloneJson(configuration);
  for (const property of [
    'env',
    'vars',
    'd1_databases',
    'assets',
    'observability',
    'triggers',
    'name',
    '$schema',
  ]) {
    delete inherited[property];
  }
  const manifest = { ...inherited, ...materialized };
  manifest.main = path.relative(
    outputDirectory,
    path.resolve(templateDirectory, configuration.main),
  );
  manifest.d1_databases = manifest.d1_databases.map((binding) => ({
    ...binding,
    ...(binding.migrations_dir
      ? {
          migrations_dir: path.relative(
            outputDirectory,
            path.resolve(templateDirectory, binding.migrations_dir),
          ),
        }
      : {}),
  }));
  return { manifest, outputPath };
}

export function createDeploymentPlan({
  repositoryRoot,
  environment,
  target,
  phase = target === 'admin' ? 'final' : 'deploy',
  dryRun,
}) {
  return {
    environment,
    target,
    phase,
    dryRun,
    sourceManifestPath: generatedManifestPath(repositoryRoot, environment, target, phase),
  };
}
