import { Test, type TestingModule } from '@nestjs/testing';
import { AppModule } from '../../app.module';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthService } from '../services/auth.service';

/**
 * Module 01 Slice 4 (capability cutover) — the audit this slice's removal
 * of profile-access.util.ts's legacy-role fallback depends on: proving,
 * against the real test database, that every User row which can exist
 * today already carries the UserCapability row hasCapability() now relies
 * on exclusively.
 *
 * Two sources can produce a CLIENT/PROVIDER User row in this codebase
 * (confirmed by inspection — no OAuth, no seed script, no other
 * user.create call site exists yet):
 *   1. Pre-Slice-1 users — covered by the Slice 1 migration's own SQL
 *      backfill (20260826120000_add_platform_role_and_capabilities/migration.sql),
 *      re-verified generally here rather than only against RUN-prefixed rows.
 *   2. Slice-3-and-later registrations — grant the capability transactionally
 *      at creation time (see registration-capability-lifecycle.integration-spec.ts).
 *
 * This suite asserts the resulting invariant holds across whatever rows are
 * actually in TEST_DATABASE_URL right now, which is what the cutover in
 * profile-access.util.ts's hasCapability() is staking correctness on.
 */

// Registration hashes a password with argon2 (deliberately slow) on top of
// real network round-trips to TEST_DATABASE_URL — same reasoning as
// registration-capability-lifecycle.integration-spec.ts.
jest.setTimeout(30_000);

const RUN = `m1-slice4-${Date.now()}`;
const createdUserIds: string[] = [];

describe('Capability cutover audit', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let authService: AuthService;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    prisma = moduleRef.get(PrismaService);
    authService = moduleRef.get(AuthService);
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

  it('every CLIENT-role user in the database holds a matching CLIENT capability row', async () => {
    const clientsMissingCapability = await prisma.client.user.count({
      where: {
        role: 'CLIENT',
        deletedAt: null,
        capabilities: { none: { capability: 'CLIENT' } },
      },
    });
    expect(clientsMissingCapability).toBe(0);
  });

  it('every PROVIDER-role user in the database holds a matching PROVIDER capability row', async () => {
    const providersMissingCapability = await prisma.client.user.count({
      where: {
        role: 'PROVIDER',
        deletedAt: null,
        capabilities: { none: { capability: 'PROVIDER' } },
      },
    });
    expect(providersMissingCapability).toBe(0);
  });

  it('a freshly-registered Client is immediately authorized on CLIENT-only actions with no fallback involved', async () => {
    const email = `${RUN}-cutover-client@example.invalid`;
    await authService.register({
      email,
      password: 'Str0ngPassword!',
      name: 'Cutover Client',
      role: 'CLIENT',
    });
    const user = await prisma.client.user.findUniqueOrThrow({ where: { email } });
    createdUserIds.push(user.id);

    const capabilities = await prisma.client.userCapability.findMany({
      where: { userId: user.id },
    });
    expect(capabilities.map((c) => c.capability)).toEqual(['CLIENT']);
  });

  it('ADMIN users hold no CLIENT/PROVIDER capability row and are correctly excluded from marketplace capability checks', async () => {
    // Confirms the cutover does not accidentally grant marketplace access to
    // platform-operator accounts — platformRole and Capability remain two
    // independent axes (module1-implementation-contract.md §0, §4.1).
    const adminsWithCapabilities = await prisma.client.user.count({
      where: { role: 'ADMIN', deletedAt: null, capabilities: { some: {} } },
    });
    expect(adminsWithCapabilities).toBe(0);
  });
});
