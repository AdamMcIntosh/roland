import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    testTimeout: 30000,
    hookTimeout: 10000,
  },
  resolve: {
    alias: {
      '@rco': path.resolve(__dirname, 'src/rco'),
    },
  },
});
