import {
  argument,
  environmentManifest,
  hasFlag,
  requireChoice,
  supportedEnvironments,
} from './configuration.mjs';

const environment = requireChoice(argument('environment'), supportedEnvironments, 'environment');
const allowPlaceholders = hasFlag('allow-placeholders');
const manifest = await environmentManifest(environment);
const expected = {
  staging: {
    database: 'open-creator-registry-staging',
    publicWorker: 'open-creator-registry-staging',
    adminWorker: 'open-creator-registry-admin-staging',
  },
  production: {
    database: 'open-creator-registry-production',
    publicWorker: 'open-creator-registry',
    adminWorker: 'open-creator-registry-admin',
  },
}[environment];

const failures = [];
if (manifest.public.selected.name !== expected.publicWorker) failures.push('public Worker name');
if (manifest.admin.selected.name !== expected.adminWorker) failures.push('admin Worker name');
if (manifest.public.database.database_name !== expected.database) failures.push('public D1 name');
if (manifest.admin.database.database_name !== expected.database) failures.push('admin D1 name');
if (manifest.public.database.database_id !== manifest.admin.database.database_id) {
  failures.push('public/admin D1 ID mismatch');
}
if (manifest.admin.selected.vars?.AUTH_PROVIDER !== 'cloudflare_access') {
  failures.push('admin AUTH_PROVIDER must be cloudflare_access');
}
if (manifest.admin.selected.vars?.WIKIDATA_FIXTURE_MODE !== 'disabled') {
  failures.push('WIKIDATA_FIXTURE_MODE must be disabled');
}
if ((manifest.admin.selected.triggers?.crons ?? []).length !== 0) {
  failures.push('Cron must remain disabled before the operational approval gate');
}
for (const [application, entry] of Object.entries(manifest)) {
  if (!entry.selected.observability?.enabled) failures.push(`${application} observability`);
  if (
    entry.selected.assets?.binding !== 'ASSETS' ||
    entry.selected.assets.run_worker_first !== true
  ) {
    failures.push(`${application} static asset binding`);
  }
}
const unresolved = [manifest.public.selected, manifest.admin.selected].flatMap((selected) =>
  [...JSON.stringify(selected).matchAll(/REPLACE_WITH_[A-Z0-9_]+/gu)].map((match) => match[0]),
);
if (unresolved.length > 0 && !allowPlaceholders) failures.push('unresolved deployment values');

if (failures.length > 0) {
  throw new Error(
    `Cloudflare ${environment} configuration is not deployable: ${failures.join(', ')}.`,
  );
}

console.log(
  JSON.stringify(
    {
      environment,
      public_worker: manifest.public.selected.name,
      admin_worker: manifest.admin.selected.name,
      database_name: manifest.public.database.database_name,
      database_id: manifest.public.database.database_id,
      unresolved_values: [...new Set(unresolved)],
      deployable: unresolved.length === 0,
    },
    null,
    2,
  ),
);
