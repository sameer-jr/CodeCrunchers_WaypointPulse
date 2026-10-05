import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/shared/src/**/*.test.ts', 'apps/api/src/**/*.test.ts', 'apps/web/src/offline/**/*.test.ts', 'apps/web/src/location/**/*.test.ts'],
    testTimeout: 15000,
    hookTimeout: 30000,
    fileParallelism: false
  }
});
