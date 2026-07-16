import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@raceproof/core': fileURLToPath(new URL('./packages/core/src/index.ts', import.meta.url)),
      '@raceproof/explorer': fileURLToPath(new URL('./packages/explorer/src/index.ts', import.meta.url)),
      '@raceproof/examples': fileURLToPath(new URL('./packages/examples/src/index.ts', import.meta.url)),
      '@raceproof/test-generator': fileURLToPath(new URL('./packages/test-generator/src/index.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['packages/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    testTimeout: 10_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      include: ['packages/core/src/**/*.ts', 'packages/explorer/src/**/*.ts'],
      exclude: ['**/*.test.ts', '**/index.ts'],
      thresholds: { lines: 85 },
    },
  },
});
