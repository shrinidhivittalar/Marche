import { clearState, deleteRunUsers, loadState, prisma } from './test-users';

// Runs even when tests fail. Leaving accounts and listings behind would
// pollute a shared database that the deployed app also reads.
export default async function globalTeardown() {
  const db = prisma();
  try {
    const { runTag } = loadState();
    const deleted = await deleteRunUsers(db, runTag);

    // Skills a test typed itself. Everything else a run creates hangs off a
    // user and cascades away with it, but a Skill is platform-wide by
    // design — the UserSkill join goes, the skill stays, and it would show
    // up in every provider's picker forever.
    const skills = await db.skill.deleteMany({ where: { name: { startsWith: 'E2E Skill ' } } });

    const leftover = await db.user.count({ where: { email: { startsWith: 'e2e-' } } });
    console.log(
      `[e2e] deleted ${deleted} test accounts (${runTag})` +
        (skills.count > 0 ? ` and ${skills.count} typed skill(s)` : ''),
    );
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
