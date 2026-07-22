import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { parse } from 'jsonc-parser';

export const repositoryRoot = path.resolve(import.meta.dirname, '../..');
export const supportedEnvironments = ['staging', 'production'];
export const supportedApplications = ['public', 'admin'];

export function requireChoice(value, choices, label) {
  if (!choices.includes(value)) {
    throw new Error(`${label} must be one of: ${choices.join(', ')}.`);
  }
  return value;
}

export function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

export function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

export async function readApplicationConfig(application) {
  const configPath = path.join(repositoryRoot, `apps/${application}/wrangler.jsonc`);
  const source = await readFile(configPath, 'utf8');
  const errors = [];
  const config = parse(source, errors, { allowTrailingComma: true });
  if (errors.length > 0 || !config || typeof config !== 'object') {
    throw new Error(`Could not parse ${configPath}.`);
  }
  return { config, configPath, source };
}

export async function environmentManifest(environment) {
  const entries = {};
  for (const application of supportedApplications) {
    const { config, configPath, source } = await readApplicationConfig(application);
    const selected = config.env?.[environment];
    if (!selected) throw new Error(`${configPath} has no env.${environment} configuration.`);
    const database = selected.d1_databases?.find((binding) => binding.binding === 'DB');
    if (!database) throw new Error(`${configPath} env.${environment} has no DB binding.`);
    entries[application] = { configPath, source, selected, database };
  }
  return entries;
}
