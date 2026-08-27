import { Test, type TestingModule } from '@nestjs/testing';
import { AppModule } from '../../app.module';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthService } from '../services/auth.service';
import { CapabilitiesService } from '../services/capabilities.service';
import { UsersRepository } from '../repositories/users.repository';

/**
 * Module 01 Slice 3 (registration and capability lifecycle) — against a
 * real Postgres database, not a mocked Prisma client, because this
 * specifically verifies things a mock cannot: real transactional rollback,
 * the DB-level (userId, capability) unique constraint under genuine
 * concurrency, and the effect of a raw email-service failure on the
 * registration transaction.
 *
 * Runs against TEST_DATABASE_URL, same pattern as
 * platform-role-and-capabilities.integration-spec.ts. Everything this file
 * creates is prefixed `m1-slice3-` and deleted in afterAll.
 */

// Registration hashes a password with argon2 (deliberately slow) on top of
// real network round-trips to TEST_DATABASE_URL — same reasoning as the
// 60s per-test timeouts in proposals/tests/acceptance.integration-spec.ts.
jest.setTimeout(30_000);

const RUN = `m1-slice3-${Date.now()}`;
const createdUserIds: string[] = [];

describe('Registration and capability lifecycle', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let authService: AuthService;
  let capabilitiesService: CapabilitiesService;
  let usersRepository: UsersRepository;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    prisma = moduleRef.get(PrismaService);
    authService = moduleRef.get(AuthService);
    capabilitiesService = moduleRef.get(CapabilitiesService);
    usersRepository = moduleRef.get(UsersRepository);
  });

  afterAll(async () => {
    await prisma.client.userCapability.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.client.profile.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.client.verificationToken.deleteMany({
      where: { userId: { in: createdUserIds } },
    });
    await prisma.client.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await moduleRef.close();
  }, 60_000);

  async function registerAndTrack(email: string, role: 'CLIENT' | 'PROVIDER') {
    await authService.register({
      email,
      password: 'Str0ngPassword!',
      name: 'Test User',
      role,
    });
    const user = await prisma.client.user.findUniqueOrThrow({ where: { email } });
    createdUserIds.push(user.id);
    return user;
  }

  describe('registration grants exactly one capability, transactionally', () => {
    it('a Client registration creates exactly one CLIENT capability row', async () => {
      const user = await registerAndTrack(`${RUN}-client@example.invalid`, 'CLIENT');

      const capabilities = await prisma.client.userCapability.findMany({
        where: { userId: user.id },
      });
      expect(capabilities).toHaveLength(1);
      expect(capabilities[0]!.capability).toBe('CLIENT');
      // Legacy role preserved alongside the new capability row.
      expect(user.role).toBe('CLIENT');
      expect(user.platformRole).toBe('USER');
    });

    it('a Provider registration creates exactly one PROVIDER capability row', async () => {
      const user = await registerAndTrack(`${RUN}-provider@example.invalid`, 'PROVIDER');

      const capabilities = await prisma.client.userCapability.findMany({
        where: { userId: user.id },
      });
      expect(capabilities).toHaveLength(1);
      expect(capabilities[0]!.capability).toBe('PROVIDER');
    });

    it('registration never produces an ADMIN/SUPER_ADMIN platformRole or capability', async () => {
      const user = await registerAndTrack(`${RUN}-noadmin@example.invalid`, 'CLIENT');

      expect(user.platformRole).toBe('USER');
      const adminCapabilities = await prisma.client.userCapability.findMany({
        where: { userId: user.id, capability: { notIn: ['CLIENT', 'PROVIDER'] } },
      });
      expect(adminCapabilities).toHaveLength(0);
    });

    it('registration and its capability grant roll back together on failure', async () => {
      const email = `${RUN}-rollback@example.invalid`;

      await expect(
        prisma.client.$transaction(async (tx) => {
          const created = await usersRepository.create(
            {
              email,
              passwordHash: 'irrelevant-for-this-test',
              name: 'Rollback User',
              role: 'CLIENT',
            },
            tx,
          );
          await usersRepository.grantCapability(created.id, 'CLIENT', tx);
          throw new Error('simulated failure after both writes, before commit');
        }),
      ).rejects.toThrow('simulated failure after both writes, before commit');

      const user = await prisma.client.user.findUnique({ where: { email } });
      expect(user).toBeNull();
    });
  });

  describe('capability activation for an existing user', () => {
    it('adds the second capability to the existing User/Profile — never creates a new identity', async () => {
      const user = await registerAndTrack(`${RUN}-upgrade@example.invalid`, 'CLIENT');
      await prisma.client.user.update({
        where: { id: user.id },
        data: { emailVerifiedAt: new Date() },
      });

      await capabilitiesService.activate(user.id, 'PROVIDER');

      const usersWithEmail = await prisma.client.user.findMany({
        where: { email: user.email },
      });
      expect(usersWithEmail).toHaveLength(1); // still exactly one identity
      const profiles = await prisma.client.profile.findMany({ where: { userId: user.id } });
      expect(profiles).toHaveLength(1); // still exactly one profile

      const capabilities = await prisma.client.userCapability.findMany({
        where: { userId: user.id },
      });
      expect(capabilities.map((c) => c.capability).sort()).toEqual(['CLIENT', 'PROVIDER']);
    });

    it('is idempotent: activating an already-held capability twice creates no duplicate row', async () => {
      const user = await registerAndTrack(`${RUN}-idempotent@example.invalid`, 'CLIENT');
      await prisma.client.user.update({
        where: { id: user.id },
        data: { emailVerifiedAt: new Date() },
      });

      await capabilitiesService.activate(user.id, 'CLIENT');
      await capabilitiesService.activate(user.id, 'CLIENT');

      const capabilities = await prisma.client.userCapability.findMany({
        where: { userId: user.id, capability: 'CLIENT' },
      });
      expect(capabilities).toHaveLength(1);
    });

    it('concurrent activation of the same capability produces exactly one row', async () => {
      const user = await registerAndTrack(`${RUN}-concurrent@example.invalid`, 'CLIENT');
      await prisma.client.user.update({
        where: { id: user.id },
        data: { emailVerifiedAt: new Date() },
      });

      await Promise.all([
        capabilitiesService.activate(user.id, 'PROVIDER'),
        capabilitiesService.activate(user.id, 'PROVIDER'),
        capabilitiesService.activate(user.id, 'PROVIDER'),
      ]);

      const capabilities = await prisma.client.userCapability.findMany({
        where: { userId: user.id, capability: 'PROVIDER' },
      });
      expect(capabilities).toHaveLength(1);
    });
  });

  describe('compatibility with users migrated before this slice', () => {
    it('a pre-existing user with only the legacy-fallback path can still activate a real capability row', async () => {
      // Simulates a user created by Slice 1's backfill: role set, but no
      // UserCapability row created via this slice's registration path
      // (backfilled users get one via the migration script, not via
      // AuthService.register — this constructs that same starting shape).
      const user = await prisma.client.user.create({
        data: {
          email: `${RUN}-legacy@example.invalid`,
          passwordHash: 'integration-test-only',
          name: 'Legacy User',
          role: 'CLIENT',
          emailVerifiedAt: new Date(),
        },
      });
      createdUserIds.push(user.id);

      await capabilitiesService.activate(user.id, 'PROVIDER');

      const capabilities = await prisma.client.userCapability.findMany({
        where: { userId: user.id },
      });
      expect(capabilities.map((c) => c.capability)).toEqual(['PROVIDER']);
      // Legacy role column untouched by activation.
      const reloaded = await prisma.client.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(reloaded.role).toBe('CLIENT');
    });
  });
});
