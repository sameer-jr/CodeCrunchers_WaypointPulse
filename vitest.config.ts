import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/shared/src/**/*.test.ts', 'apps/api/src/**/*.test.ts'],
    testTimeout: 15000,
    hookTimeout: 30000,
    fileParallelism: false
  }
});
