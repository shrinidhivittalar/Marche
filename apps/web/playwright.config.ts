import { defineConfig, devices } from '@playwright/test';
import { config as loadEnv } from 'dotenv';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

// End-to-end tests run the real API against a real Postgres database — but
// its own, never the one the deployed app uses. TEST_DATABASE_URL lives
// beside DATABASE_URL in packages/db/.env (see .env.example there for how to
// create it).
//
// Read here rather than left to each process's own .env because two
// processes need it: the API server started below, and this Playwright
// process, whose fixtures talk to the database directly (see
// e2e/test-users.ts). Assigning DATABASE_URL for our own process is what
// points PrismaClient at the test database — @nestjs/config and Prisma both
// leave an already-set process.env variable alone, so the value passed to
// the server wins over the DATABASE_URL in apps/api/.env.
const fileEnv = loadEnv({ path: join(REPO_ROOT, 'packages', 'db', '.env') }).parsed ?? {};

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? fileEnv.TEST_DATABASE_URL;
if (!TEST_DATABASE_URL) {
  throw new Error(
    'TEST_DATABASE_URL is not set. The e2e suite creates and deletes accounts, ' +
      'so it must never point at the application database. Add TEST_DATABASE_URL ' +
      'to packages/db/.env, then run `npm run db:test:prepare`.',
  );
}
// The whole point of the variable, so it is worth checking rather than
// trusting: a copy-paste that leaves both pointing at the same database
// would put every run's fixtures back into real data, silently.
//
// Compared against the file rather than process.env.DATABASE_URL, because
// the assignment below makes those two identical by design — and Playwright
// re-evaluates this config in every worker process, which inherits it. Read
// from the environment, the check passes in the parent and then fails the
// whole run in the first worker it starts.
if (TEST_DATABASE_URL === fileEnv.DATABASE_URL) {
  throw new Error(
    'TEST_DATABASE_URL is identical to DATABASE_URL. The e2e suite needs its own database.',
  );
}
process.env.DATABASE_URL = TEST_DATABASE_URL;

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
      //
      // Built here rather than assumed: `start` serves dist/, so without
      // this the suite silently tests whatever was compiled last. That is
      // the worst kind of green — an API change can look verified when the
      // server never had it.
      command: 'npm run build -w @marche/api && npm run start -w @marche/api',
      cwd: '../..',
      port: API_PORT,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        PORT: String(API_PORT),
        NODE_ENV: 'development',
        FRONTEND_ORIGIN: WEB_URL,
        // The server under test writes to the test database, not the one in
        // apps/api/.env.
        DATABASE_URL: TEST_DATABASE_URL,
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
