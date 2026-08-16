import { defineConfig, devices } from '@playwright/test';

const WEB_URL = process.env.E2E_WEB_URL ?? 'http://localhost:3100';
const API_URL = process.env.E2E_API_URL ?? 'http://localhost:4100';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  // Checkout mutates shared stock; parallel workers would make inventory
  // assertions racy for reasons unrelated to the code under test.
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never' }], ['list']]
    : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: WEB_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15_000,
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['setup'],
      testIgnore: [/responsive\.spec\.ts/, /auth\.setup\.ts/],
    },
    {
      name: 'mobile',
      use: { ...devices['Pixel 7'] },
      testMatch: /responsive\.spec\.ts/,
    },
  ],
  webServer: process.env.E2E_NO_SERVER
    ? undefined
    : [
        {
          command: 'npm run start:prod --prefix ../backend',
          url: `${API_URL}/health/live`,
          reuseExistingServer: true,
          timeout: 120_000,
        },
        {
          command: 'npm run start --prefix ../frontend',
          url: WEB_URL,
          reuseExistingServer: true,
          timeout: 120_000,
        },
      ],
});
