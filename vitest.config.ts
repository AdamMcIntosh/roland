import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Flaky wired-dashboard tests (Puppeteer / GitHub mock timing) — re-enable with:
    // ROLAND_RUN_FLAKY_INTEGRATION=1 npm run test:run
    exclude: process.env.ROLAND_RUN_FLAKY_INTEGRATION === '1'
      ? []
      : [
          'tests/integration/dashboard-github.test.ts',
          'tests/integration/dashboard-mobile-responsive.test.ts',
          'tests/integration/dashboard-run-state.test.ts',
        ],
    testTimeout: 30000,
    hookTimeout: 10000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/rco/fixtures/**'],
      thresholds: {
        statements: 80,
        branches: 70,
        functions: 80,
        lines: 80,
      },
    },
  },
  resolve: {
    alias: {
      '@rco': path.resolve(__dirname, 'src/rco'),
    },
  },
});
