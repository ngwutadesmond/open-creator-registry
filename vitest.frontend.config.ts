import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['apps/public/**/*.component.test.tsx', 'apps/admin/**/*.component.test.tsx'],
    setupFiles: ['apps/public/src/client/test/setup.ts'],
  },
});
