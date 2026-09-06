// Brings the e2e test database up to the current schema and seeds it.
//
// Prisma takes its connection string from DATABASE_URL and has no flag for
// "use this other one", so this script runs the ordinary commands with
// TEST_DATABASE_URL substituted in. That substitution is the whole reason
// the script exists — setting an environment variable inline is shell
// syntax, and this repo is developed on Windows and deployed on Linux.
//
// `migrate deploy`, never `migrate dev`: dev is interactive, and can offer
// to reset a database. Deploy only applies what is already committed.
//
// `migrate deploy` reads schema.prisma's datasource.directUrl
// (DIRECT_DATABASE_URL) for the actual migration, never DATABASE_URL —
// see the comment on that field. Swapping DATABASE_URL alone therefore left
// every `migrate deploy` run here silently applying against whatever
// DIRECT_DATABASE_URL pointed at (production's direct connection, in this
// repo's case) instead of the test database — harmless only by luck, since
// production already had every migration `migrate deploy` was ever asked to
// apply here. TEST_DIRECT_DATABASE_URL is the test database's own direct
// (non-pooled) connection string; it's swapped in the same way, but only
// for the migrate step — `db seed` runs through Prisma Client, which uses
// DATABASE_URL, not directUrl.
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

loadEnv({ path: join(PACKAGE_ROOT, '.env') });

const { TEST_DATABASE_URL, DATABASE_URL, TEST_DIRECT_DATABASE_URL, DIRECT_DATABASE_URL } =
  process.env;

if (!TEST_DATABASE_URL) {
  console.error(
    'TEST_DATABASE_URL is not set in packages/db/.env — see .env.example for how to create one.',
  );
  process.exit(1);
}
// Same guard as playwright.config.ts, for the same reason: this script
// migrates and seeds whatever it is pointed at.
if (TEST_DATABASE_URL === DATABASE_URL) {
  console.error(
    'TEST_DATABASE_URL is identical to DATABASE_URL — the test database must be its own.',
  );
  process.exit(1);
}
if (!TEST_DIRECT_DATABASE_URL) {
  console.error(
    'TEST_DIRECT_DATABASE_URL is not set in packages/db/.env — see .env.example for how to ' +
      'create one. Without it, `migrate deploy` below reads DIRECT_DATABASE_URL instead — ' +
      'production\'s direct connection, not the test database\'s.',
  );
  process.exit(1);
}
if (TEST_DIRECT_DATABASE_URL === DIRECT_DATABASE_URL) {
  console.error(
    'TEST_DIRECT_DATABASE_URL is identical to DIRECT_DATABASE_URL — the test database must ' +
      'have its own direct connection.',
  );
  process.exit(1);
}

const run = (label, args, env) => {
  console.log(`[test-db] ${label}`);
  const result = spawnSync('npx', args, {
    cwd: PACKAGE_ROOT,
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, ...env },
  });
  if (result.status !== 0) {
    console.error(`[test-db] ${label} failed`);
    process.exit(result.status ?? 1);
  }
};

run('applying migrations', ['prisma', 'migrate', 'deploy'], {
  DATABASE_URL: TEST_DATABASE_URL,
  DIRECT_DATABASE_URL: TEST_DIRECT_DATABASE_URL,
});
run('seeding', ['prisma', 'db', 'seed'], { DATABASE_URL: TEST_DATABASE_URL });

console.log('[test-db] ready');
