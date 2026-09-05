import { Test, type TestingModule } from '@nestjs/testing';
import { AppModule } from '../../app.module';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Module 01 Slice 1 (database foundation) — against a real Postgres
 * database, not a mocked Prisma client, because this specifically verifies
 * things a mock cannot: DB-level constraint enforcement (the unique index,
 * cascade delete) and the correctness of the one-time migration backfill
 * against real existing rows.
 *
 * Runs against TEST_DATABASE_URL, same pattern as
 * proposals/tests/*.integration-spec.ts. Everything this file creates is
 * prefixed `m1-platform-` and deleted in afterAll, including on failure.
 */

const RUN = `m1-platform-${Date.now()}`;
const createdUserIds: string[] = [];

describe('platformRole and UserCapability — schema foundation', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    prisma = moduleRef.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.client.userCapability.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.client.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await moduleRef.close();
  }, 60_000);

  async function makeUser(role: 'CLIENT' | 'PROVIDER' | 'ADMIN', label: string) {
    const user = await prisma.client.user.create({
      data: {
        email: `${RUN}-${label}@example.invalid`,
        passwordHash: 'integration-test-only',
        name: `${RUN} ${label}`,
        role,
      },
    });
    createdUserIds.push(user.id);
    return user;
  }

  describe('new schema — structural behavior', () => {
    it('defaults platformRole to USER when not specified, alongside the legacy role', async () => {
      const user = await makeUser('CLIENT', 'default-role');
      expect(user.platformRole).toBe('USER');
      expect(user.role).toBe('CLIENT'); // legacy column still present and unchanged
    });

    it('allows a User to hold both CLIENT and PROVIDER capability rows simultaneously', async () => {
      const user = await makeUser('CLIENT', 'dual-capability');
      await prisma.client.userCapability.create({
        data: { userId: user.id, capability: 'CLIENT' },
      });
      await prisma.client.userCapability.create({
        data: { userId: user.id, capability: 'PROVIDER' },
      });

      const capabilities = await prisma.client.userCapability.findMany({
        where: { userId: user.id },
      });
      expect(capabilities.map((c) => c.capability).sort()).toEqual(['CLIENT', 'PROVIDER']);
    });

    it('rejects a duplicate (userId, capability) pair at the database level', async () => {
      const user = await makeUser('PROVIDER', 'duplicate-capability');
      await prisma.client.userCapability.create({
        data: { userId: user.id, capability: 'PROVIDER' },
      });

      await expect(
        prisma.client.userCapability.create({ data: { userId: user.id, capability: 'PROVIDER' } }),
      ).rejects.toThrow();
    });

    it('cascades: deleting a User removes their UserCapability rows', async () => {
      const user = await makeUser('CLIENT', 'cascade-delete');
      await prisma.client.userCapability.create({
        data: { userId: user.id, capability: 'CLIENT' },
      });

      await prisma.client.user.delete({ where: { id: user.id } });
      createdUserIds.splice(createdUserIds.indexOf(user.id), 1); // already gone, don't double-delete in afterAll

      const remaining = await prisma.client.userCapability.findMany({ where: { userId: user.id } });
      expect(remaining).toHaveLength(0);
    });

    it('accepts all three PlatformRole values', async () => {
      const admin = await prisma.client.user.create({
        data: {
          email: `${RUN}-super-admin@example.invalid`,
          passwordHash: 'integration-test-only',
          name: `${RUN} super admin`,
          role: 'ADMIN',
          platformRole: 'SUPER_ADMIN',
        },
      });
      expect(admin.platformRole).toBe('SUPER_ADMIN');

      // Deleted immediately, not left for afterAll: the backfill-correctness
      // tests below assert every ADMIN-role row has platformRole=ADMIN,
      // which this row deliberately violates (it's ADMIN role +
      // SUPER_ADMIN platform role) — it must not still be present by then.
      await prisma.client.user.delete({ where: { id: admin.id } });
    });
  });

  describe('migration backfill — correctness against real existing data', () => {
    /**
     * These assert the invariant the migration's data backfill is supposed
     * to establish for every row that existed before Slice 1 shipped:
     * production-refactor/module1-migration-plan.md §2.2's deterministic
     * mapping. They run against whatever rows are already in the database
     * (this integration suite's own test-DB users plus any left over from
     * other suites), not just rows this file creates — the whole point is
     * to catch a backfill that missed rows, not just to test the mapping
     * function in isolation.
     *
     * Excludes this file's own RUN-prefixed users: the structural tests
     * above create fresh CLIENT/PROVIDER rows to exercise the new schema,
     * not to simulate a pre-migration row, and this slice does not (and is
     * not meant to) give new registrations a capability row — that is a
     * future slice's job. Filtering them out keeps these assertions scoped
     * to what the migration's one-time backfill actually touched.
     */
    const preExisting = { email: { not: { contains: RUN } } };

    it('every ADMIN user has platformRole ADMIN or SUPER_ADMIN, and holds no capability rows', async () => {
      const admins = await prisma.client.user.findMany({
        where: { role: 'ADMIN', ...preExisting },
        include: { capabilities: true },
      });

      expect(admins.length).toBeGreaterThan(0); // sanity: the assertion below is meaningless if this is 0
      for (const admin of admins) {
        // The backfill itself only ever produces ADMIN — SUPER_ADMIN shows
        // up here once bootstrap-super-admin.ts (module1-implementation-
        // contract.md §5) promotes one of these rows in place, which is the
        // one legitimate way a pre-existing ADMIN-role row ends up with a
        // platformRole the backfill mapping alone would never produce.
        expect(['ADMIN', 'SUPER_ADMIN']).toContain(admin.platformRole);
        expect(admin.capabilities).toHaveLength(0);
      }
    });

    it('every CLIENT user (not also holding PROVIDER) has platformRole=USER and exactly one CLIENT capability row', async () => {
      const clients = await prisma.client.user.findMany({
        where: { role: 'CLIENT', ...preExisting },
        include: { capabilities: true },
      });

      expect(clients.length).toBeGreaterThan(0);
      for (const client of clients) {
        expect(client.platformRole).toBe('USER');
        const clientCaps = client.capabilities.filter((c) => c.capability === 'CLIENT');
        expect(clientCaps).toHaveLength(1);
      }
    });

    it('every PROVIDER user (not also holding CLIENT) has platformRole=USER and exactly one PROVIDER capability row', async () => {
      const providers = await prisma.client.user.findMany({
        where: { role: 'PROVIDER', ...preExisting },
        include: { capabilities: true },
      });

      expect(providers.length).toBeGreaterThan(0);
      for (const provider of providers) {
        expect(provider.platformRole).toBe('USER');
        const providerCaps = provider.capabilities.filter((c) => c.capability === 'PROVIDER');
        expect(providerCaps).toHaveLength(1);
      }
    });

    it('no user has a platformRole/role combination the backfill mapping does not produce', async () => {
      // The migration's mapping is CLIENT/PROVIDER -> USER, ADMIN -> ADMIN.
      // SUPER_ADMIN is never produced by the backfill (no legacy role maps
      // to it) directly — it only exists for rows created after this
      // migration, or for a pre-existing ADMIN row later promoted in place
      // by bootstrap-super-admin.ts, same exception as the test above.
      const mismatches = await prisma.client.user.count({
        where: {
          OR: [
            { role: 'ADMIN', platformRole: { notIn: ['ADMIN', 'SUPER_ADMIN'] } },
            { role: { in: ['CLIENT', 'PROVIDER'] }, platformRole: { not: 'USER' } },
          ],
        },
      });
      expect(mismatches).toBe(0);
    });
  });
});
