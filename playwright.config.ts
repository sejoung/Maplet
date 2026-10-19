import { defineConfig, devices } from '@playwright/test';
import { join } from 'node:path';

const results = process.env.MAPLET_TEST_RUN_DIR ?? 'test-results/unmanaged/e2e';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  outputDir: join(results, 'artifacts'),
  reporter: [
    ['list'],
    ['html', { outputFolder: join(results, 'html'), open: 'never' }],
    ['json', { outputFile: join(results, 'results.json') }],
    ['junit', { outputFile: join(results, 'junit.xml') }],
  ],
  use: { baseURL: 'http://127.0.0.1:4173', trace: 'retain-on-failure' },
  webServer: {
    command: 'npm run dev -- --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    env: {
      VITE_GOOGLE_CLIENT_ID: 'public-test-client',
      VITE_GOOGLE_API_KEY: 'public-test-key',
      VITE_GOOGLE_APP_ID: 'public-test-project',
    },
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'mobile', use: { ...devices['iPhone 13'] } },
  ],
});
