import { Test, type TestingModule } from '@nestjs/testing';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { AppModule } from '../../app.module';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminService } from '../services/admin.service';
import type { PlatformRole } from '@marche/db';

/**
 * Module 01 Slice 6 — admin/Super Admin provisioning, against a real
 * Postgres database because the invariant this slice's design review
 * called "essential" — never removing the last Super Admin — is exactly
 * the kind of thing a mock cannot prove: it depends on a real COUNT(*)
 * over real rows.
 *
 * Runs against TEST_DATABASE_URL. Everything created here is prefixed
 * `m1-slice6-` and deleted (or restored) in afterAll/finally blocks, even
 * on failure.
 */

jest.setTimeout(30_000);

const RUN = `m1-slice6-${Date.now()}`;
const createdUserIds: string[] = [];

describe('AdminService.changePlatformRole', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let adminService: AdminService;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    prisma = moduleRef.get(PrismaService);
    adminService = moduleRef.get(AdminService);
  });

  afterAll(async () => {
    await prisma.client.auditLog.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.client.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await moduleRef.close();
  }, 60_000);

  async function makeUser(label: string, platformRole: PlatformRole = 'USER') {
    const user = await prisma.client.user.create({
      data: {
        email: `${RUN}-${label}@example.invalid`,
        passwordHash: 'integration-test-only',
        name: `${RUN} ${label}`,
        role: 'CLIENT',
        platformRole,
        emailVerifiedAt: new Date(),
      },
    });
    createdUserIds.push(user.id);
    return user;
  }

  it('promotes USER to ADMIN and writes exactly one audit row', async () => {
    const actor = await makeUser('actor-promote', 'SUPER_ADMIN');
    const target = await makeUser('target-promote', 'USER');

    const result = await adminService.changePlatformRole(actor.id, target.id, 'ADMIN');

    expect(result).toEqual({ changed: true, platformRole: 'ADMIN' });
    const reloaded = await prisma.client.user.findUniqueOrThrow({ where: { id: target.id } });
    expect(reloaded.platformRole).toBe('ADMIN');

    const auditRows = await prisma.client.auditLog.findMany({
      where: { eventType: 'admin.platform_role.changed', userId: actor.id },
    });
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0]!.metadata).toMatchObject({
      targetUserId: target.id,
      previousRole: 'USER',
      newRole: 'ADMIN',
    });
  });

  it('is a true no-op when the requested role already matches — no write, no new audit row', async () => {
    const actor = await makeUser('actor-noop', 'SUPER_ADMIN');
    const target = await makeUser('target-noop', 'ADMIN');

    const result = await adminService.changePlatformRole(actor.id, target.id, 'ADMIN');

    expect(result).toEqual({ changed: false, platformRole: 'ADMIN' });
    const auditRows = await prisma.client.auditLog.count({
      where: { eventType: 'admin.platform_role.changed', userId: actor.id },
    });
    expect(auditRows).toBe(0);
  });

  it('rejects a self-change even for a Super Admin', async () => {
    const actor = await makeUser('actor-self', 'SUPER_ADMIN');

    await expect(
      adminService.changePlatformRole(actor.id, actor.id, 'ADMIN'),
    ).rejects.toBeInstanceOf(ForbiddenException);

    const reloaded = await prisma.client.user.findUniqueOrThrow({ where: { id: actor.id } });
    expect(reloaded.platformRole).toBe('SUPER_ADMIN');
  });

  it('allows demoting a Super Admin when another one remains', async () => {
    const actor = await makeUser('actor-demote-safe', 'SUPER_ADMIN');
    const target = await makeUser('target-demote-safe', 'SUPER_ADMIN');
    // actor itself is a second Super Admin, so demoting target never risks
    // zero remaining — no sweep of pre-existing rows needed for this case.

    const result = await adminService.changePlatformRole(actor.id, target.id, 'ADMIN');

    expect(result.changed).toBe(true);
    const reloaded = await prisma.client.user.findUniqueOrThrow({ where: { id: target.id } });
    expect(reloaded.platformRole).toBe('ADMIN');
  });

  it('rejects demoting the last Super Admin in the system', async () => {
    // This is the one test that needs the *global* Super Admin count to be
    // exactly 1, not just "1 among the rows this test created" — the
    // invariant is genuinely global, so this sweeps every other Super
    // Admin in the database, including ones this same file's earlier tests
    // created (actor-self, actor-demote-safe), not just rows from other
    // files/runs. All of them are restored in the finally block, even if
    // an assertion throws.
    const actor = await makeUser('actor-last', 'ADMIN');
    const lastSuperAdmin = await makeUser('target-last', 'SUPER_ADMIN');

    const otherSuperAdmins = await prisma.client.user.findMany({
      where: { platformRole: 'SUPER_ADMIN', id: { not: lastSuperAdmin.id } },
      select: { id: true },
    });
    const otherIds = otherSuperAdmins.map((u) => u.id);

    try {
      if (otherIds.length > 0) {
        await prisma.client.user.updateMany({
          where: { id: { in: otherIds } },
          data: { platformRole: 'ADMIN' },
        });
      }

      await expect(
        adminService.changePlatformRole(actor.id, lastSuperAdmin.id, 'ADMIN'),
      ).rejects.toBeInstanceOf(ConflictException);

      const reloaded = await prisma.client.user.findUniqueOrThrow({
        where: { id: lastSuperAdmin.id },
      });
      expect(reloaded.platformRole).toBe('SUPER_ADMIN');
    } finally {
      if (otherIds.length > 0) {
        await prisma.client.user.updateMany({
          where: { id: { in: otherIds } },
          data: { platformRole: 'SUPER_ADMIN' },
        });
      }
    }
  });

  it('404s for a non-existent target', async () => {
    const actor = await makeUser('actor-404', 'SUPER_ADMIN');

    await expect(
      adminService.changePlatformRole(actor.id, 'not-a-real-user-id', 'ADMIN'),
    ).rejects.toThrow();
  });
});
