import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3001';
const apiURL = process.env.E2E_API_URL ?? 'http://localhost:3100';
const startWebServer =
  process.env.E2E_NO_WEB_SERVER !== '1' && process.env.E2E_NO_WEB_SERVER !== 'true';

export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: [['html', { open: 'never' }], ['list']],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: [
    startWebServer
      ? {
          command: 'cd ../backend && npx dotenv-cli -e .env.test -- npm run start:dev',
          url: `${apiURL}/health`,
          reuseExistingServer: true,
          timeout: 120_000,
        }
      : undefined,
    startWebServer
      ? {
          command: 'npm run dev',
          url: baseURL,
          reuseExistingServer: true,
          timeout: 120_000,
        }
      : undefined,
  ].filter((x): x is NonNullable<typeof x> => x !== undefined),
  projects: [
    // Setup projects run first to create auth state
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts$/,
    },
    {
      name: 'setup-member',
      testMatch: /auth\.setup\.member\.ts$/,
    },

    // Desktop browser projects
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'playwright/.auth/user.json',
      },
      dependencies: ['setup', 'setup-member'],
    },
    {
      name: 'firefox',
      use: {
        ...devices['Desktop Firefox'],
        storageState: 'playwright/.auth/user.json',
      },
      dependencies: ['setup', 'setup-member'],
    },
    {
      name: 'webkit',
      use: {
        ...devices['Desktop Safari'],
        storageState: 'playwright/.auth/user.json',
      },
      dependencies: ['setup', 'setup-member'],
    },

    // Mobile device projects
    {
      name: 'mobile-chrome',
      use: {
        ...devices['Pixel 7'],
        storageState: 'playwright/.auth/user.json',
      },
      dependencies: ['setup', 'setup-member'],
    },
    {
      name: 'mobile-safari',
      use: {
        ...devices['iPhone 14'],
        storageState: 'playwright/.auth/user.json',
      },
      dependencies: ['setup', 'setup-member'],
    },
  ],
});
