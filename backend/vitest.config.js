import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['**/__tests__/**/*.test.js'],
    setupFiles: ['./__tests__/setup.js'],
    testTimeout: 10000,
  },
});
