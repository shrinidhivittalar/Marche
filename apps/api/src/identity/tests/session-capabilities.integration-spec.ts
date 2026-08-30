// Booting AppModule here does not go through main.ts, which is what loads
// the environment in a running app — so this file has to do its own load
// or JWT_ACCESS_SECRET is unset and issuing a session throws *after* the
// user row has already been written. Safe alongside jest.setup-test-db.js's
// DATABASE_URL swap: dotenv never overwrites an already-set process.env
// key, it only fills in what is still missing. Same import, for the same
// reason, as google-oauth.integration-spec.ts.
import 'dotenv/config';
import { Test, type TestingModule } from '@nestjs/testing';
import * as argon2 from 'argon2';
import { AppModule } from '../../app.module';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthService } from '../services/auth.service';
import { UsersService } from '../services/users.service';
import type { Capability } from '@marche/db';

/**
 * Module 02 Slice A — capabilities in the authenticated-user response.
 *
 * These run against a real database specifically because the unit tests
 * cannot prove the thing most likely to be wrong: the response is only
 * correct if UsersRepository.findByEmail and findById actually `include`
 * the capability relation. A mocked repository returns whatever the test
 * hands it, so a forgotten `include` would pass every unit test and fail
 * silently in production, returning an empty capability array for a user
 * who genuinely holds capabilities.
 *
 * Covers both entry points the frontend depends on:
 *   - AuthService.login  -> fresh sign-in
 *   - UsersService.getById (GET /users/me) -> page reload
 *
 * Runs against TEST_DATABASE_URL. Everything created here is prefixed
 * `m2-sliceA-${Date.now()}` and deleted in afterAll, including on failure.
 */

// argon2 hashing (deliberately slow) on top of real round-trips to a
// hosted database — same reasoning as the other identity integration specs.
jest.setTimeout(30_000);

const RUN = `m2-sliceA-${Date.now()}`;
const createdUserIds: string[] = [];

const PASSWORD = 'Str0ngPassword!';

describe('capabilities in the authenticated-user response', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let authService: AuthService;
  let usersService: UsersService;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    prisma = moduleRef.get(PrismaService);
    authService = moduleRef.get(AuthService);
    usersService = moduleRef.get(UsersService);
  }, 60_000);

  afterAll(async () => {
    await prisma.client.session.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.client.userCapability.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.client.profile.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.client.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await moduleRef.close();
  }, 60_000);

  /**
   * A verified, active user holding exactly the capabilities given. Built
   * directly rather than through register() so a user can hold both
   * capabilities (registration grants exactly one) and so the legacy role
   * can be set independently of them.
   */
  async function makeUser(
    label: string,
    capabilities: Capability[],
    overrides: {
      role?: 'CLIENT' | 'PROVIDER' | 'ADMIN';
      platformRole?: 'USER' | 'SUPER_ADMIN';
    } = {},
  ) {
    const email = `${RUN}-${label}@example.invalid`;
    const user = await prisma.client.user.create({
      data: {
        email,
        passwordHash: await argon2.hash(PASSWORD),
        name: `${RUN} ${label}`,
        role: overrides.role ?? 'CLIENT',
        platformRole: overrides.platformRole ?? 'USER',
        emailVerifiedAt: new Date(),
        capabilities: { create: capabilities.map((capability) => ({ capability })) },
      },
    });
    createdUserIds.push(user.id);
    return { id: user.id, email };
  }

  describe('password login', () => {
    it('returns the capability the user actually holds', async () => {
      const user = await makeUser('single', ['PROVIDER'], { role: 'PROVIDER' });

      const result = await authService.login({ email: user.email, password: PASSWORD }, {});

      expect(result.user.capabilities).toEqual(['PROVIDER']);
    });

    it('returns both capabilities for a dual-capability user', async () => {
      const user = await makeUser('dual', ['CLIENT', 'PROVIDER']);

      const result = await authService.login({ email: user.email, password: PASSWORD }, {});

      expect([...result.user.capabilities].sort()).toEqual(['CLIENT', 'PROVIDER']);
    });

    // The legacy role column is not a capability and must never stand in
    // for one: this user's role says PROVIDER while the only granted
    // capability is CLIENT, and the response must report the grant.
    it('reads the capability rows, not the legacy role column', async () => {
      const user = await makeUser('role-mismatch', ['CLIENT'], { role: 'PROVIDER' });

      const result = await authService.login({ email: user.email, password: PASSWORD }, {});

      expect(result.user.capabilities).toEqual(['CLIENT']);
      expect(result.user.role).toBe('PROVIDER');
    });

    // platformRole is an orthogonal axis (Module 01): administrative
    // standing grants no marketplace capability, and none must be invented.
    it('reports no capabilities for a Super Admin holding none', async () => {
      const user = await makeUser('super-admin', [], {
        role: 'ADMIN',
        platformRole: 'SUPER_ADMIN',
      });

      const result = await authService.login({ email: user.email, password: PASSWORD }, {});

      expect(result.user.capabilities).toEqual([]);
    });
  });

  describe('GET /users/me', () => {
    // The page-reload path: the frontend refreshes its session and then
    // re-reads the user from here, so capabilities have to survive that
    // round trip as well as the initial sign-in.
    it('returns the same capabilities the login response did', async () => {
      const user = await makeUser('me-dual', ['CLIENT', 'PROVIDER']);

      const loginResult = await authService.login({ email: user.email, password: PASSWORD }, {});
      const meResult = await usersService.getById(user.id);

      expect([...meResult.capabilities].sort()).toEqual(['CLIENT', 'PROVIDER']);
      expect([...meResult.capabilities].sort()).toEqual([...loginResult.user.capabilities].sort());
    });

    it('reports no capabilities for a user holding none', async () => {
      const user = await makeUser('me-none', []);

      const result = await usersService.getById(user.id);

      expect(result.capabilities).toEqual([]);
    });
  });
});
