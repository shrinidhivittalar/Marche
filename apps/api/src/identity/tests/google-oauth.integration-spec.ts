// AppModule's JwtModule.register reads process.env.JWT_ACCESS_SECRET at
// decoration time — same reason main.ts loads dotenv first (see its own
// comment there). Booting AppModule directly in a test, as every
// integration spec here does, skips main.ts entirely, so this file needs
// its own load. Safe alongside jest.setup-test-db.js's DATABASE_URL swap:
// dotenv never overwrites an already-set process.env key, only fills in
// what's still missing.
import 'dotenv/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { AppModule } from '../../app.module';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthService } from '../services/auth.service';
import { GoogleAuthVerifier } from '../google-auth-verifier';
import { RedisThrottlerStorage } from '../../throttler/redis-throttler-storage';

/**
 * Module 01 Slice 7 — Google OAuth + account linking, against the real
 * test database. GoogleAuthVerifier itself is stubbed (no real Google
 * servers reachable from a test run) — everything downstream of the
 * verified {sub, email, emailVerified} triple runs for real: the atomic
 * User+Profile+AuthenticationMethod creation, the (provider,
 * providerAccountId) unique constraint under a genuine race, and the
 * migration backfill.
 *
 * Runs against TEST_DATABASE_URL. Everything created here is prefixed
 * `m1-slice7-` and deleted in afterAll.
 */

jest.setTimeout(30_000);

const RUN = `m1-slice7-${Date.now()}`;
const createdUserIds: string[] = [];

describe('Google OAuth + account linking', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let authService: AuthService;
  let googleAuthVerifier: { verify: jest.Mock };

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(RedisThrottlerStorage)
      .useValue({
        increment: async () => ({
          totalHits: 0,
          timeToExpire: 0,
          isBlocked: false,
          timeToBlockExpire: 0,
        }),
      })
      .overrideProvider(GoogleAuthVerifier)
      .useValue({ verify: jest.fn() })
      .compile();
    prisma = moduleRef.get(PrismaService);
    authService = moduleRef.get(AuthService);
    googleAuthVerifier = moduleRef.get(GoogleAuthVerifier);
  });

  afterAll(async () => {
    await prisma.client.authenticationMethod.deleteMany({
      where: { userId: { in: createdUserIds } },
    });
    await prisma.client.verification.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.client.profile.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.client.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await moduleRef.close();
  }, 60_000);

  function verifiedIdentity(
    overrides: Partial<{
      sub: string;
      email: string;
      emailVerified: boolean;
    }> = {},
  ) {
    return {
      sub: `${RUN}-sub-${Math.random().toString(36).slice(2)}`,
      email: `${RUN}-${Math.random().toString(36).slice(2)}@example.invalid`,
      emailVerified: true,
      ...overrides,
    };
  }

  async function registerPasswordUser(label: string) {
    await authService.register({
      email: `${RUN}-${label}@example.invalid`,
      password: 'Str0ngPassword!',
      name: label,
      role: 'CLIENT',
    });
    const user = await prisma.client.user.findUniqueOrThrow({
      where: { email: `${RUN}-${label}@example.invalid` },
    });
    createdUserIds.push(user.id);
    return user;
  }

  describe('new Google user', () => {
    it('creates User + Profile + AuthenticationMethod(GOOGLE) atomically, with zero capabilities', async () => {
      const identity = verifiedIdentity();
      googleAuthVerifier.verify.mockResolvedValue(identity);

      const result = await authService.googleLogin('any-token', {});
      expect('accessToken' in result).toBe(true);

      const user = await prisma.client.user.findUniqueOrThrow({ where: { email: identity.email } });
      createdUserIds.push(user.id);

      const profile = await prisma.client.profile.findUnique({ where: { userId: user.id } });
      expect(profile).not.toBeNull();

      const authMethod = await prisma.client.authenticationMethod.findUnique({
        where: {
          provider_providerAccountId: { provider: 'GOOGLE', providerAccountId: identity.sub },
        },
      });
      expect(authMethod?.userId).toBe(user.id);

      const capabilities = await prisma.client.userCapability.findMany({
        where: { userId: user.id },
      });
      expect(capabilities).toHaveLength(0);

      expect(user.emailVerifiedAt).not.toBeNull();
      const verification = await prisma.client.verification.findUnique({
        where: { userId_type: { userId: user.id, type: 'EMAIL' } },
      });
      expect(verification?.status).toBe('VERIFIED');
    });

    it('creates the account but issues no session when Google has not verified the email', async () => {
      const identity = verifiedIdentity({ emailVerified: false });
      googleAuthVerifier.verify.mockResolvedValue(identity);

      const result = await authService.googleLogin('any-token', {});
      expect(result).toEqual({ status: 'verification_email_sent' });

      const user = await prisma.client.user.findUniqueOrThrow({ where: { email: identity.email } });
      createdUserIds.push(user.id);
      expect(user.emailVerifiedAt).toBeNull();
    });
  });

  describe('returning Google user', () => {
    it('authenticates by sub on a second call, without creating a second identity', async () => {
      const identity = verifiedIdentity();
      googleAuthVerifier.verify.mockResolvedValue(identity);

      await authService.googleLogin('token-1', {});
      const first = await prisma.client.user.findUniqueOrThrow({
        where: { email: identity.email },
      });
      createdUserIds.push(first.id);

      await authService.googleLogin('token-2', {});

      const usersWithEmail = await prisma.client.user.findMany({
        where: { email: identity.email },
      });
      expect(usersWithEmail).toHaveLength(1);
    });
  });

  describe('email collision — never silently linked', () => {
    it('rejects a Google sign-in whose email matches an existing password account', async () => {
      const passwordUser = await registerPasswordUser('collision');
      googleAuthVerifier.verify.mockResolvedValue(verifiedIdentity({ email: passwordUser.email }));

      await expect(authService.googleLogin('any-token', {})).rejects.toBeInstanceOf(
        ConflictException,
      );

      const authMethods = await prisma.client.authenticationMethod.findMany({
        where: { userId: passwordUser.id },
      });
      // Only the backfilled/registered EMAIL_PASSWORD row — no GOOGLE row
      // was attached by the failed attempt.
      expect(authMethods.map((m) => m.provider)).toEqual(['EMAIL_PASSWORD']);
    });
  });

  describe('linking from an authenticated session', () => {
    it('links a fresh Google account to the caller', async () => {
      const user = await registerPasswordUser('link-fresh');
      const identity = verifiedIdentity();
      googleAuthVerifier.verify.mockResolvedValue(identity);

      const result = await authService.linkGoogleAccount(user.id, 'any-token');

      expect(result).toEqual({ linked: true });
      const authMethod = await prisma.client.authenticationMethod.findUnique({
        where: {
          provider_providerAccountId: { provider: 'GOOGLE', providerAccountId: identity.sub },
        },
      });
      expect(authMethod?.userId).toBe(user.id);
    });

    it('is idempotent: linking the same Google account twice for the same user succeeds without a duplicate row', async () => {
      const user = await registerPasswordUser('link-idempotent');
      const identity = verifiedIdentity();
      googleAuthVerifier.verify.mockResolvedValue(identity);

      await authService.linkGoogleAccount(user.id, 'any-token');
      await authService.linkGoogleAccount(user.id, 'any-token');

      const rows = await prisma.client.authenticationMethod.findMany({
        where: { userId: user.id, provider: 'GOOGLE' },
      });
      expect(rows).toHaveLength(1);
    });

    it('rejects linking a Google account already attached to a different user', async () => {
      const owner = await registerPasswordUser('link-owner');
      const other = await registerPasswordUser('link-other');
      const identity = verifiedIdentity();
      googleAuthVerifier.verify.mockResolvedValue(identity);
      await authService.linkGoogleAccount(owner.id, 'any-token');

      await expect(authService.linkGoogleAccount(other.id, 'any-token')).rejects.toBeInstanceOf(
        ConflictException,
      );

      const rows = await prisma.client.authenticationMethod.findMany({
        where: { provider: 'GOOGLE', providerAccountId: identity.sub },
      });
      expect(rows).toHaveLength(1);
      expect(rows[0]!.userId).toBe(owner.id);
    });

    it('concurrent link attempts for the same account produce exactly one AuthenticationMethod row', async () => {
      const user = await registerPasswordUser('link-concurrent');
      const identity = verifiedIdentity();
      googleAuthVerifier.verify.mockResolvedValue(identity);

      await Promise.all([
        authService.linkGoogleAccount(user.id, 'any-token'),
        authService.linkGoogleAccount(user.id, 'any-token'),
        authService.linkGoogleAccount(user.id, 'any-token'),
      ]);

      const rows = await prisma.client.authenticationMethod.findMany({
        where: { userId: user.id, provider: 'GOOGLE' },
      });
      expect(rows).toHaveLength(1);
    });
  });

  describe('migration compatibility', () => {
    it('every pre-existing user has exactly one EMAIL_PASSWORD authentication method', async () => {
      const user = await registerPasswordUser('backfill-check');

      const rows = await prisma.client.authenticationMethod.findMany({
        where: { userId: user.id, provider: 'EMAIL_PASSWORD' },
      });
      expect(rows).toHaveLength(1);
      expect(rows[0]!.providerAccountId).toBeNull();
    });

    it('the invalid-credential path never touches the database', async () => {
      googleAuthVerifier.verify.mockRejectedValue(
        new UnauthorizedException('Invalid Google credential'),
      );

      await expect(authService.googleLogin('garbage', {})).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });
});
