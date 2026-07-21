import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
    },
    exclude: ['apps/public/**/*.integration.test.ts', 'packages/database/**/*.integration.test.ts'],
    include: ['apps/**/*.test.{ts,tsx}', 'packages/**/*.test.ts'],
  },
});
