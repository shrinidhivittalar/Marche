import { clearState, deleteRunUsers, loadState, prisma } from './test-users';

// Runs even when tests fail. Leaving accounts and listings behind would
// pollute a shared database that the deployed app also reads.
export default async function globalTeardown() {
  const db = prisma();
  try {
    const { runTag } = loadState();
    const deleted = await deleteRunUsers(db, runTag);
    const leftover = await db.user.count({ where: { email: { startsWith: 'e2e-' } } });
    console.log(`[e2e] deleted ${deleted} test accounts (${runTag})`);
    if (leftover > 0) {
      // Loud rather than silent: leftovers mean a previous run crashed
      // before teardown, and they will accumulate until someone notices.
      console.warn(`[e2e] WARNING: ${leftover} account(s) from earlier runs remain`);
    }
  } catch (err) {
    console.error('[e2e] teardown failed:', err);
    throw err;
  } finally {
    clearState();
    await db.$disconnect();
  }
}
