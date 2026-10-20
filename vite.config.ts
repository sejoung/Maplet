import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { join } from 'node:path';

const results = process.env.MAPLET_TEST_RUN_DIR ?? 'test-results/unmanaged/unit';

export default defineConfig({
  plugins: [react()],
  base: './',
  server: { strictPort: true },
  test: {
    environment: 'node',
    maxWorkers: process.env.CI ? 2 : undefined,
    // Let jsdom provide browser storage instead of Node's experimental Web Storage.
    execArgv: ['--no-experimental-webstorage'],
    include: ['tests/**/*.test.{ts,tsx}'],
    setupFiles: ['tests/setup.ts'],
    reporters: ['default', 'json', 'junit'],
    outputFile: { json: join(results, 'results.json'), junit: join(results, 'junit.xml') },
    coverage: {
      provider: 'v8',
      reportsDirectory: join(results, 'coverage'),
      include: [
        'src/domain/**',
        'src/application/**',
        'src/adapters/**',
        'src/engine/**',
        'src/i18n/core.ts',
        'src/i18n/locale.ts',
      ],
      thresholds: { statements: 85, branches: 75, functions: 90, lines: 85 },
    },
  },
});
