// One-time, manually-invoked promotion of the first Super Admin
// (module1-implementation-contract.md §5). Not an HTTP endpoint — every
// subsequent role change goes through PATCH /admin/users/:id/platform-role,
// which requires an existing Super Admin to call it. This script exists
// only to break that chicken-and-egg problem once.
//
// Usage: BOOTSTRAP_SUPER_ADMIN_EMAIL=jane@example.com npm run db:bootstrap-super-admin
import { prisma } from '../src/client';

async function main() {
  const email = process.env.BOOTSTRAP_SUPER_ADMIN_EMAIL;
  if (!email) {
    console.error(
      'BOOTSTRAP_SUPER_ADMIN_EMAIL must be set — this script never reads an email from anywhere else.',
    );
    process.exit(1);
  }

  // Refuses to run if any Super Admin already exists: this is the one
  // bootstrap event, not a general promotion tool. Every subsequent
  // elevation goes through the authenticated endpoint.
  const existingSuperAdminCount = await prisma.user.count({
    where: { platformRole: 'SUPER_ADMIN', deletedAt: null },
  });
  if (existingSuperAdminCount > 0) {
    console.error(
      `Refusing to run: ${existingSuperAdminCount} Super Admin(s) already exist. ` +
        'Use PATCH /admin/users/:id/platform-role instead.',
    );
    process.exit(1);
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || user.deletedAt) {
    console.error(`No active user found with email ${email}. They must register first.`);
    process.exit(1);
  }
  if (user.platformRole === 'SUPER_ADMIN') {
    console.log(`${email} is already a Super Admin. Nothing to do.`);
    return;
  }

  const previousRole = user.platformRole;
  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { platformRole: 'SUPER_ADMIN' } }),
    // No authenticated actor exists for the very first promotion — recorded
    // with a fixed system actor string, per the contract's §5 exception.
    prisma.auditLog.create({
      data: {
        eventType: 'admin.platform_role.changed',
        userId: user.id,
        metadata: {
          targetUserId: user.id,
          previousRole,
          newRole: 'SUPER_ADMIN',
          actor: 'system-bootstrap-script',
        },
      },
    }),
  ]);

  console.log(`${email} promoted to SUPER_ADMIN.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
