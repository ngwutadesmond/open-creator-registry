import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
    },
    exclude: [
      'apps/**/*.component.test.tsx',
      'apps/public/**/*.integration.test.ts',
      'apps/admin/**/*.integration.test.ts',
      'packages/database/**/*.integration.test.ts',
    ],
    include: [
      'apps/**/*.test.{ts,tsx}',
      'packages/**/*.test.ts',
      'scripts/cloudflare/**/*.test.mjs',
    ],
  },
});
