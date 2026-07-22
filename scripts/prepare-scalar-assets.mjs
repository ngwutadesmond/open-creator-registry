import { copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const repositoryRoot = path.resolve(import.meta.dirname, '..');
const source = path.join(
  repositoryRoot,
  'node_modules/@scalar/api-reference/dist/browser/standalone.js',
);
const target = path.join(repositoryRoot, '.generated/scalar-assets/vendor/scalar/standalone.js');

await mkdir(path.dirname(target), { recursive: true });
await copyFile(source, target);
