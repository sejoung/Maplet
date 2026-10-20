import { defineConfig, devices } from '@playwright/test';
import { join } from 'node:path';

const results = process.env.MAPLET_TEST_RUN_DIR ?? 'test-results/unmanaged/e2e';
const driveBehavior = [
  '**/drive-autosave.spec.ts',
  '**/drive-batching.spec.ts',
  '**/drive-merge.spec.ts',
  '**/drive-resume.spec.ts',
  '**/drive-session.spec.ts',
];

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  workers: process.env.CI ? 2 : '75%',
  outputDir: join(results, 'artifacts'),
  reporter: [
    ['list'],
    ['html', { outputFolder: join(results, 'html'), open: 'never' }],
    ['json', { outputFile: join(results, 'results.json') }],
    ['junit', { outputFile: join(results, 'junit.xml') }],
  ],
  use: { baseURL: 'http://127.0.0.1:4173', trace: 'retain-on-failure', locale: 'ko-KR' },
  webServer: {
    command: 'node scripts/serve-e2e.mjs',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
    env: {
      VITE_GOOGLE_CLIENT_ID: 'public-test-client',
      VITE_GOOGLE_API_KEY: 'public-test-key',
      VITE_GOOGLE_APP_ID: 'public-test-project',
    },
  },
  projects: [
    {
      name: 'drive-contract',
      testMatch: '**/drive.spec.ts',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'drive-behavior',
      testMatch: driveBehavior,
      use: { ...devices['Desktop Chrome'] },
    },
    ...[
      { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
      { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
      { name: 'webkit', use: { ...devices['Desktop Safari'] } },
      { name: 'mobile', use: { ...devices['iPhone 13'] } },
    ].map((project) => ({ ...project, testIgnore: ['**/drive.spec.ts', ...driveBehavior] })),
  ],
});
