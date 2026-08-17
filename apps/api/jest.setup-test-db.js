// Points the integration suite at the e2e test database.
//
// These specs write to a real Postgres — that is the entire reason they
// exist — so they must not be pointed at the application's database. Same
// variable, same two guards and same reasoning as the e2e suite: see
// apps/web/playwright.config.ts.
//
// Runs as a `setupFiles` entry rather than `globalSetup` because the value
// has to be in place inside each worker before the first import constructs a
// PrismaClient from it. @nestjs/config leaves an already-set process.env
// variable alone, so this wins over the DATABASE_URL in apps/api/.env when
// the spec builds the AppModule.
const { join } = require('node:path');

const fileEnv =
  require('dotenv').config({ path: join(__dirname, '..', '..', 'packages', 'db', '.env') })
    .parsed ?? {};

// The application's URL is read from the file, not from process.env, which
// this file overwrites a few lines down — see the same note in
// apps/web/playwright.config.ts.
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? fileEnv.TEST_DATABASE_URL;
const DATABASE_URL = fileEnv.DATABASE_URL;

if (!TEST_DATABASE_URL) {
  throw new Error(
    'TEST_DATABASE_URL is not set. The integration specs write to a real database, ' +
      'so they need their own — add it to packages/db/.env and run `npm run db:test:prepare`.',
  );
}
if (TEST_DATABASE_URL === DATABASE_URL) {
  throw new Error(
    'TEST_DATABASE_URL is identical to DATABASE_URL. The integration specs need their own database.',
  );
}

process.env.DATABASE_URL = TEST_DATABASE_URL;
