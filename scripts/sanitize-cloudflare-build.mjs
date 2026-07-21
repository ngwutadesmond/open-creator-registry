import { readdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const outputDirectory = resolve(process.argv[2] ?? 'dist');

/** @param {string} directory */
async function removeLocalDevelopmentFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      await removeLocalDevelopmentFiles(path);
    } else if (entry.name === '.dev.vars' || entry.name.startsWith('.dev.vars.')) {
      await rm(path);
    }
  }
}

await removeLocalDevelopmentFiles(outputDirectory);

/** @type {string[]} */
const remainingFiles = [];
/** @param {string} directory */
async function findLocalDevelopmentFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) await findLocalDevelopmentFiles(path);
    else if (entry.name === '.dev.vars' || entry.name.startsWith('.dev.vars.'))
      remainingFiles.push(path);
  }
}

await findLocalDevelopmentFiles(outputDirectory);
if (remainingFiles.length > 0) {
  throw new Error('Cloudflare build output still contains local development variable files.');
}
