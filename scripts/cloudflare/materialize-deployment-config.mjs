import { readFile, writeFile } from 'node:fs/promises';
import { URL } from 'node:url';
import { parse } from 'jsonc-parser';

import {
  argument,
  environmentManifest,
  hasFlag,
  requireChoice,
  supportedEnvironments,
} from './configuration.mjs';

const environment = requireChoice(argument('environment'), supportedEnvironments, 'environment');
const dryRun = hasFlag('dry-run');

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required to materialize ${environment} configuration.`);
  return value;
}

const databaseId = required('OCR_D1_DATABASE_ID');
const accountSubdomain = required('OCR_ACCOUNT_SUBDOMAIN');
const accessTeamName = required('OCR_ACCESS_TEAM_NAME');
const accessAudience = required('OCR_ACCESS_AUD');
const projectContactUrl = required('OCR_PROJECT_CONTACT_URL');

if (!/^[0-9a-f]{32}$/u.test(databaseId))
  throw new Error('OCR_D1_DATABASE_ID must be 32 hex digits.');
if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u.test(accountSubdomain)) {
  throw new Error('OCR_ACCOUNT_SUBDOMAIN must be a valid workers.dev account label.');
}
if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u.test(accessTeamName)) {
  throw new Error('OCR_ACCESS_TEAM_NAME must be a valid Cloudflare Access team label.');
}
if (!/^[A-Za-z0-9_-]{10,256}$/u.test(accessAudience)) {
  throw new Error('OCR_ACCESS_AUD must be a bounded Access audience value.');
}
const contactUrl = new URL(projectContactUrl);
if (contactUrl.protocol !== 'https:') throw new Error('OCR_PROJECT_CONTACT_URL must use HTTPS.');

const environmentToken = environment === 'staging' ? 'STAGING' : 'PRODUCTION';
const replacements = new Map([
  ['REPLACE_WITH_ACCOUNT_SUBDOMAIN', accountSubdomain],
  [`REPLACE_WITH_${environmentToken}_D1_ID`, databaseId],
  ['REPLACE_WITH_TEAM_NAME', accessTeamName],
  [`REPLACE_WITH_${environmentToken}_ACCESS_AUD`, accessAudience],
  ['REPLACE_WITH_PROJECT_CONTACT_URL', projectContactUrl],
]);

const manifest = await environmentManifest(environment);
const outputs = [];
for (const entry of Object.values(manifest)) {
  let source = await readFile(entry.configPath, 'utf8');
  for (const [placeholder, value] of replacements) source = source.replaceAll(placeholder, value);
  const errors = [];
  const parsed = parse(source, errors, { allowTrailingComma: true });
  const selected = parsed?.env?.[environment];
  if (errors.length > 0 || !selected) {
    throw new Error(`Materialized ${entry.configPath} could not be validated.`);
  }
  outputs.push({ configPath: entry.configPath, selected, source });
}

const unresolved = outputs.flatMap(
  ({ selected }) => JSON.stringify(selected).match(/REPLACE_WITH_[A-Z0-9_]+/gu) ?? [],
);
if (unresolved.length > 0) {
  throw new Error(`Materialized ${environment} configuration still contains placeholders.`);
}

if (!dryRun) {
  await Promise.all(outputs.map(({ configPath, source }) => writeFile(configPath, source, 'utf8')));
}

console.log(
  `${environment} deployment configuration ${dryRun ? 'validated' : 'materialized'} without logging protected values.`,
);
