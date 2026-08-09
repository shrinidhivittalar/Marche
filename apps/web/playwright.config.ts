import { defineConfig, devices } from '@playwright/test';

// End-to-end tests run the real API against the real database. There is no
// separate test database yet (recorded as a known gap in module3.md), so
// every fixture creates its own uniquely-named users and deletes them in
// teardown — see e2e/global-setup.ts and e2e/global-teardown.ts.
//
// Ports are deliberately not the dev defaults: a developer's own `npm run
// dev` should not collide with a test run, and a test run must never
// accidentally drive a server someone is using.
const API_PORT = 4310;
const WEB_PORT = 5310;

export const API_URL = `http://localhost:${API_PORT}`;
export const WEB_URL = `http://localhost:${WEB_PORT}`;

export default defineConfig({
  testDir: './e2e',
  // Serial. These share one database, and parallel workers creating and
  // deleting users in the same tables produce failures that look like
  // product bugs but are not.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [['list']],
  timeout: 60_000,
  expect: { timeout: 10_000 },

  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',

  use: {
    baseURL: WEB_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  webServer: [
    {
      // Built output, not ts-node-dev: the dev runner restarts on file
      // changes, which makes a test run non-deterministic.
      command: 'npm run start -w @marche/api',
      cwd: '../..',
      port: API_PORT,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        PORT: String(API_PORT),
        NODE_ENV: 'development',
        FRONTEND_ORIGIN: WEB_URL,
        // Auth routes are limited to 5/min in production, which a suite
        // that signs in per test trips almost immediately. Sessions cannot
        // be shared instead: refresh tokens are single-use and rotating, so
        // a saved cookie jar is dead after its first use. Raised only for
        // this process; the application default is untouched.
        AUTH_RATE_LIMIT: '500',
      },
    },
    {
      command: `npm run dev -w @marche/web -- --port ${WEB_PORT} --strictPort`,
      cwd: '../..',
      port: WEB_PORT,
      reuseExistingServer: false,
      timeout: 120_000,
      env: { VITE_API_URL: API_URL },
    },
  ],
});
