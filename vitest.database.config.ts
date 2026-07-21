import path from 'node:path';

import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    cloudflareTest(async () => ({
      miniflare: {
        bindings: {
          TEST_MIGRATIONS: await readD1Migrations(path.resolve('packages/database/migrations')),
        },
        d1Databases: ['DB'],
      },
    })),
  ],
  test: {
    include: ['packages/database/**/*.integration.test.ts'],
    setupFiles: ['packages/database/src/test/apply-migrations.ts'],
  },
});
