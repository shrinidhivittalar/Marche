// The specs that need a real database, kept in their own config because
// they need one thing the unit specs must never have: a live connection.
//
// They ran only on demand while the hosted application database was the only
// one available. There is a test database now (TEST_DATABASE_URL), so they
// run with everything else — the concurrency spec in particular guards a
// property no mock can check, and a test that only runs when someone
// remembers is a test that eventually does not run.
//
// Serial: they assert on what happens when two writers race for the same
// row, which is not a thing to have parallel workers interfering with.
/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: 'src',
  testRegex: '.*\\.integration-spec\\.ts$',
  maxWorkers: 1,
  setupFiles: ['<rootDir>/../jest.setup-test-db.js'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { isolatedModules: true }],
  },
};
