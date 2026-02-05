import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/e2e/browser.test.ts'], // Exclude Playwright E2E tests
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/types/*.ts', '**/*.d.ts', 'tests/e2e/browser.test.ts'],
    },
    setupFiles: ['tests/setup.ts'],
    alias: {
      '@': resolve(__dirname, './src'),
    },
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: true, // 避免并行测试的隔离问题
      },
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
});
