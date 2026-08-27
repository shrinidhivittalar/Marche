import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { AuthService } from '../services/auth.service';
import type { UsersRepository } from '../repositories/users.repository';
import type { SessionsRepository } from '../repositories/sessions.repository';
import type { VerificationTokensRepository } from '../repositories/verification-tokens.repository';
import type { VerificationsRepository } from '../repositories/verifications.repository';
import type { PasswordResetsRepository } from '../repositories/password-resets.repository';
import type { EmailService } from '../../email/email.service';
import type { AuditService } from '../../audit/audit.service';
import type { ProfilesService } from '../../profiles/services/profiles.service';
import type { ReferralsService } from '../../referrals/services/referrals.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { User } from '@marche/db';

function buildUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user_1',
    email: 'jane@example.com',
    passwordHash: 'hashed',
    name: 'Jane',
    role: 'CLIENT',
    status: 'ACTIVE',
    emailVerifiedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  } as User;
}

describe('AuthService', () => {
  let usersRepository: jest.Mocked<UsersRepository>;
  let sessionsRepository: jest.Mocked<SessionsRepository>;
  let verificationTokensRepository: jest.Mocked<VerificationTokensRepository>;
  let verificationsRepository: jest.Mocked<VerificationsRepository>;
  let passwordResetsRepository: jest.Mocked<PasswordResetsRepository>;
  let emailService: jest.Mocked<EmailService>;
  let auditService: jest.Mocked<AuditService>;
  let profilesService: jest.Mocked<ProfilesService>;
  let referralsService: jest.Mocked<ReferralsService>;
  let prismaService: jest.Mocked<PrismaService>;
  let authService: AuthService;

  beforeEach(() => {
    usersRepository = {
      findByEmail: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      markEmailVerified: jest.fn(),
      updatePasswordHash: jest.fn(),
      grantCapability: jest.fn(),
    } as unknown as jest.Mocked<UsersRepository>;

    sessionsRepository = {
      create: jest.fn(),
      findActiveByRefreshTokenHash: jest.fn(),
      findByRefreshTokenHash: jest.fn(),
      revoke: jest.fn(),
      revokeAllForUser: jest.fn(),
    } as unknown as jest.Mocked<SessionsRepository>;

    verificationTokensRepository = {
      create: jest.fn(),
      findByTokenHash: jest.fn(),
      deleteById: jest.fn(),
    } as unknown as jest.Mocked<VerificationTokensRepository>;

    verificationsRepository = {
      upsertEmailVerified: jest.fn(),
    } as unknown as jest.Mocked<VerificationsRepository>;

    passwordResetsRepository = {
      create: jest.fn(),
      findByTokenHash: jest.fn(),
      markUsed: jest.fn(),
    } as unknown as jest.Mocked<PasswordResetsRepository>;

    emailService = {
      sendVerificationEmail: jest.fn(),
      sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
      sendDuplicateRegistrationEmail: jest.fn(),
    } as unknown as jest.Mocked<EmailService>;

    auditService = {
      record: jest.fn(),
    } as unknown as jest.Mocked<AuditService>;

    profilesService = {
      createForNewUser: jest.fn(),
    } as unknown as jest.Mocked<ProfilesService>;

    referralsService = {
      handleUserJoined: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<ReferralsService>;

    prismaService = {
      client: {
        $transaction: jest.fn((callback: (tx: unknown) => unknown) => callback(undefined)),
      },
    } as unknown as jest.Mocked<PrismaService>;

    authService = new AuthService(
      usersRepository,
      sessionsRepository,
      verificationTokensRepository,
      verificationsRepository,
      passwordResetsRepository,
      emailService,
      new JwtService({ secret: 'test-secret' }),
      auditService,
      profilesService,
      referralsService,
      prismaService,
    );
  });

  describe('register', () => {
    const registerDto = {
      email: 'jane@example.com',
      password: 'Password123',
      name: 'Jane',
      role: 'CLIENT',
    } as const;

    it('answers a duplicate email exactly as it answers a new one', async () => {
      usersRepository.findByEmail.mockResolvedValue(null);
      usersRepository.create.mockResolvedValue(buildUser());
      const newAddressResult = await authService.register({ ...registerDto });

      jest.clearAllMocks();
      usersRepository.findByEmail.mockResolvedValue(buildUser());
      const takenAddressResult = await authService.register({ ...registerDto });

      // Identical resolved body, and no thrown status to tell them apart.
      expect(takenAddressResult).toEqual(newAddressResult);
      expect(usersRepository.create).not.toHaveBeenCalled();
      expect(emailService.sendVerificationEmail).not.toHaveBeenCalled();
    });

    it('warns the existing owner and audits the duplicate attempt', async () => {
      const existing = buildUser();
      usersRepository.findByEmail.mockResolvedValue(existing);

      await authService.register({ ...registerDto });

      expect(emailService.sendDuplicateRegistrationEmail).toHaveBeenCalledWith(existing.email);
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'auth.register.duplicate',
          userId: existing.id,
        }),
      );
    });

    it('pays the argon2 cost on the duplicate path too, so timing is not the new oracle', async () => {
      // argon2 is intentionally slow and dominates this request. Skipping it
      // for a duplicate would make the duplicate branch obviously faster, so
      // measure against the cost of a single hash rather than a fixed number
      // of milliseconds, which would differ per machine.
      const hashStart = Date.now();
      await argon2.hash('Password123');
      const oneHash = Date.now() - hashStart;

      usersRepository.findByEmail.mockResolvedValue(buildUser());
      const duplicateStart = Date.now();
      await authService.register({ ...registerDto });
      const duplicateElapsed = Date.now() - duplicateStart;

      expect(duplicateElapsed).toBeGreaterThanOrEqual(oneHash / 2);
    });

    it('creates the user, hashes the password, and sends a verification email', async () => {
      usersRepository.findByEmail.mockResolvedValue(null);
      const created = buildUser();
      usersRepository.create.mockResolvedValue(created);

      const result = await authService.register({
        email: 'jane@example.com',
        password: 'Password123',
        name: 'Jane',
        role: 'CLIENT',
      });

      expect(usersRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'jane@example.com', name: 'Jane', role: 'CLIENT' }),
        undefined,
      );
      const storedHash = usersRepository.create.mock.calls[0]![0].passwordHash;
      expect(await argon2.verify(storedHash, 'Password123')).toBe(true);
      expect(emailService.sendVerificationEmail).toHaveBeenCalledWith(
        'jane@example.com',
        expect.any(String),
      );
      expect(result).toEqual({ status: 'verification_email_sent' });
      // Not yet — the address isn't proven to belong to whoever registered
      // it until they verify it (see the verifyEmail describe block below).
      expect(referralsService.handleUserJoined).not.toHaveBeenCalled();
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'auth.register', userId: created.id }),
      );
      expect(profilesService.createForNewUser).toHaveBeenCalledWith(
        created.id,
        created.name,
        undefined,
      );
    });

    it('grants exactly one CLIENT capability, inside the same transaction, for a Client registration', async () => {
      usersRepository.findByEmail.mockResolvedValue(null);
      const created = buildUser({ role: 'CLIENT' });
      usersRepository.create.mockResolvedValue(created);

      await authService.register({ ...registerDto, role: 'CLIENT' });

      expect(usersRepository.grantCapability).toHaveBeenCalledTimes(1);
      expect(usersRepository.grantCapability).toHaveBeenCalledWith(created.id, 'CLIENT', undefined);
    });

    it('grants exactly one PROVIDER capability for a Provider registration', async () => {
      usersRepository.findByEmail.mockResolvedValue(null);
      const created = buildUser({ role: 'PROVIDER' });
      usersRepository.create.mockResolvedValue(created);

      await authService.register({ ...registerDto, role: 'PROVIDER' });

      expect(usersRepository.grantCapability).toHaveBeenCalledTimes(1);
      expect(usersRepository.grantCapability).toHaveBeenCalledWith(
        created.id,
        'PROVIDER',
        undefined,
      );
    });

    it('never grants ADMIN/SUPER_ADMIN capability or platformRole — RegisterDto has no such field', async () => {
      usersRepository.findByEmail.mockResolvedValue(null);
      const created = buildUser();
      usersRepository.create.mockResolvedValue(created);

      await authService.register({ ...registerDto, role: 'CLIENT' });

      // grantCapability is only ever called with the enum value that came
      // from dto.role, which RegisterDto restricts to CLIENT|PROVIDER
      // (@IsIn) at the validation layer — there is no code path in
      // register() that can pass anything else.
      const grantedCapability = usersRepository.grantCapability.mock.calls[0]![1];
      expect(['CLIENT', 'PROVIDER']).toContain(grantedCapability);
      expect(usersRepository.create).toHaveBeenCalledWith(
        expect.not.objectContaining({ platformRole: expect.anything() }),
        undefined,
      );
    });

    it('does not grant a capability on the duplicate-email path', async () => {
      usersRepository.findByEmail.mockResolvedValue(buildUser());

      await authService.register({ ...registerDto });

      expect(usersRepository.grantCapability).not.toHaveBeenCalled();
    });

    it('rolls back nothing further and rethrows if capability granting fails mid-transaction', async () => {
      usersRepository.findByEmail.mockResolvedValue(null);
      const created = buildUser();
      usersRepository.create.mockResolvedValue(created);
      usersRepository.grantCapability.mockRejectedValue(new Error('db unavailable'));

      await expect(authService.register({ ...registerDto })).rejects.toThrow('db unavailable');
      // The transaction callback throwing is what causes Prisma to roll back
      // User + Profile + Capability together — this test's mocked
      // $transaction just invokes the callback directly, so the meaningful
      // assertion is that the error from inside the callback propagates
      // rather than being swallowed, which is what would let a partial
      // registration succeed.
      expect(emailService.sendVerificationEmail).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    it('rejects an unknown email', async () => {
      usersRepository.findByEmail.mockResolvedValue(null);

      await expect(
        authService.login({ email: 'jane@example.com', password: 'Password123' }, {}),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'auth.login.failure', email: 'jane@example.com' }),
      );
    });

    it('rejects an incorrect password', async () => {
      const passwordHash = await argon2.hash('correct-password');
      usersRepository.findByEmail.mockResolvedValue(buildUser({ passwordHash }));

      await expect(
        authService.login({ email: 'jane@example.com', password: 'wrong-password' }, {}),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects a suspended account', async () => {
      const passwordHash = await argon2.hash('Password123');
      usersRepository.findByEmail.mockResolvedValue(
        buildUser({ passwordHash, status: 'SUSPENDED' }),
      );

      await expect(
        authService.login({ email: 'jane@example.com', password: 'Password123' }, {}),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects a disabled account', async () => {
      const passwordHash = await argon2.hash('Password123');
      usersRepository.findByEmail.mockResolvedValue(
        buildUser({ passwordHash, status: 'DISABLED' }),
      );

      await expect(
        authService.login({ email: 'jane@example.com', password: 'Password123' }, {}),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects a soft-deleted account even if status still reads ACTIVE', async () => {
      const passwordHash = await argon2.hash('Password123');
      usersRepository.findByEmail.mockResolvedValue(
        buildUser({ passwordHash, deletedAt: new Date() }),
      );

      await expect(
        authService.login({ email: 'jane@example.com', password: 'Password123' }, {}),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects an empty password against a real hash rather than throwing unhandled', async () => {
      const passwordHash = await argon2.hash('Password123');
      usersRepository.findByEmail.mockResolvedValue(buildUser({ passwordHash }));

      await expect(
        authService.login({ email: 'jane@example.com', password: '' }, {}),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects an account whose email has not been verified', async () => {
      const passwordHash = await argon2.hash('Password123');
      usersRepository.findByEmail.mockResolvedValue(
        buildUser({ passwordHash, emailVerifiedAt: null }),
      );

      await expect(
        authService.login({ email: 'jane@example.com', password: 'Password123' }, {}),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'auth.login.failure',
          email: 'jane@example.com',
          metadata: expect.objectContaining({ reason: 'email_not_verified' }),
        }),
      );
      expect(sessionsRepository.create).not.toHaveBeenCalled();
    });

    it('issues tokens and creates a session on success', async () => {
      const passwordHash = await argon2.hash('Password123');
      usersRepository.findByEmail.mockResolvedValue(
        buildUser({ passwordHash, emailVerifiedAt: new Date() }),
      );

      const result = await authService.login(
        { email: 'jane@example.com', password: 'Password123' },
        {},
      );

      expect(result.accessToken).toEqual(expect.any(String));
      expect(result.refreshToken).toEqual(expect.any(String));
      expect(sessionsRepository.create).toHaveBeenCalledTimes(1);
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'auth.login.success', email: 'jane@example.com' }),
      );
    });
  });

  describe('resetPassword', () => {
    it('rejects an expired token', async () => {
      passwordResetsRepository.findByTokenHash.mockResolvedValue({
        id: 'reset_1',
        userId: 'user_1',
        tokenHash: 'hash',
        expiresAt: new Date(Date.now() - 1000),
        usedAt: null,
        createdAt: new Date(),
      });

      await expect(authService.resetPassword('raw-token', 'NewPassword123')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('rejects a token that has already been used once', async () => {
      passwordResetsRepository.findByTokenHash.mockResolvedValue({
        id: 'reset_1',
        userId: 'user_1',
        tokenHash: 'hash',
        expiresAt: new Date(Date.now() + 1000 * 60),
        usedAt: new Date(),
        createdAt: new Date(),
      });

      await expect(authService.resetPassword('raw-token', 'NewPassword123')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(usersRepository.updatePasswordHash).not.toHaveBeenCalled();
    });

    it('rejects an unknown token', async () => {
      passwordResetsRepository.findByTokenHash.mockResolvedValue(null);

      await expect(
        authService.resetPassword('garbage-token', 'NewPassword123'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('updates the password and revokes existing sessions on success', async () => {
      passwordResetsRepository.findByTokenHash.mockResolvedValue({
        id: 'reset_1',
        userId: 'user_1',
        tokenHash: 'hash',
        expiresAt: new Date(Date.now() + 1000 * 60),
        usedAt: null,
        createdAt: new Date(),
      });

      await authService.resetPassword('raw-token', 'NewPassword123');

      expect(usersRepository.updatePasswordHash).toHaveBeenCalledWith('user_1', expect.any(String));
      expect(passwordResetsRepository.markUsed).toHaveBeenCalledWith('reset_1');
      expect(sessionsRepository.revokeAllForUser).toHaveBeenCalledWith('user_1');
    });
  });

  describe('refresh', () => {
    const activeSession = {
      id: 'session_1',
      userId: 'user_1',
      refreshTokenHash: 'hash',
      userAgent: null,
      ipAddress: null,
      expiresAt: new Date(Date.now() + 1000 * 60),
      revokedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('rejects a token with no matching active session', async () => {
      sessionsRepository.findActiveByRefreshTokenHash.mockResolvedValue(null);
      sessionsRepository.findByRefreshTokenHash.mockResolvedValue(null);

      await expect(authService.refresh('raw-token', {})).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(sessionsRepository.revokeAllForUser).not.toHaveBeenCalled();
    });

    it('kills every session for the account when a rotated-away token is replayed', async () => {
      sessionsRepository.findActiveByRefreshTokenHash.mockResolvedValue(null);
      sessionsRepository.findByRefreshTokenHash.mockResolvedValue({
        ...activeSession,
        revokedAt: new Date(),
      });

      await expect(authService.refresh('raw-token', {})).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(sessionsRepository.revokeAllForUser).toHaveBeenCalledWith('user_1');
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'auth.refresh_token.reuse', userId: 'user_1' }),
      );
    });

    it('rotates the session: revokes the old one and issues a new pair', async () => {
      sessionsRepository.findActiveByRefreshTokenHash.mockResolvedValue(activeSession);
      usersRepository.findById.mockResolvedValue(buildUser());

      const result = await authService.refresh('raw-token', {});

      expect(sessionsRepository.revoke).toHaveBeenCalledWith('session_1');
      expect(sessionsRepository.create).toHaveBeenCalledTimes(1);
      expect(result.accessToken).toEqual(expect.any(String));
      expect(result.refreshToken).toEqual(expect.any(String));
    });

    it('rejects when the session belongs to a since-suspended user', async () => {
      sessionsRepository.findActiveByRefreshTokenHash.mockResolvedValue(activeSession);
      usersRepository.findById.mockResolvedValue(buildUser({ status: 'SUSPENDED' }));

      await expect(authService.refresh('raw-token', {})).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('rejects when the session belongs to a since-deleted user', async () => {
      sessionsRepository.findActiveByRefreshTokenHash.mockResolvedValue(activeSession);
      usersRepository.findById.mockResolvedValue(buildUser({ deletedAt: new Date() }));

      await expect(authService.refresh('raw-token', {})).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('rejects when the session references a user that no longer exists at all', async () => {
      sessionsRepository.findActiveByRefreshTokenHash.mockResolvedValue(activeSession);
      usersRepository.findById.mockResolvedValue(null);

      await expect(authService.refresh('raw-token', {})).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });

  describe('logout', () => {
    it('revokes the session matching the refresh token', async () => {
      sessionsRepository.findActiveByRefreshTokenHash.mockResolvedValue({
        id: 'session_1',
        userId: 'user_1',
        refreshTokenHash: 'hash',
        userAgent: null,
        ipAddress: null,
        expiresAt: new Date(Date.now() + 1000 * 60),
        revokedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await authService.logout('raw-token');

      expect(sessionsRepository.revoke).toHaveBeenCalledWith('session_1');
    });

    it('is a no-op when the refresh token has no matching session', async () => {
      sessionsRepository.findActiveByRefreshTokenHash.mockResolvedValue(null);

      await authService.logout('raw-token');

      expect(sessionsRepository.revoke).not.toHaveBeenCalled();
    });
  });

  describe('forgotPassword', () => {
    it('does nothing for an unknown email, without revealing that to the caller', async () => {
      usersRepository.findByEmail.mockResolvedValue(null);

      await authService.forgotPassword('unknown@example.com');

      expect(passwordResetsRepository.create).not.toHaveBeenCalled();
      expect(emailService.sendPasswordResetEmail).not.toHaveBeenCalled();
    });

    it('creates a reset token and emails it for a known user', async () => {
      usersRepository.findByEmail.mockResolvedValue(buildUser());

      await authService.forgotPassword('jane@example.com');

      expect(passwordResetsRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user_1' }),
      );
      expect(emailService.sendPasswordResetEmail).toHaveBeenCalledWith(
        'jane@example.com',
        expect.any(String),
      );
    });

    it('holds both the known and unknown branches to the same floor', async () => {
      // The original leak was duration, not content: the unknown branch
      // returned after one SELECT while the known one awaited an outbound
      // send. Assert the floor applies to both, so neither is measurably
      // quicker than the other.
      usersRepository.findByEmail.mockResolvedValue(null);
      const unknownStart = Date.now();
      await authService.forgotPassword('unknown@example.com');
      const unknownElapsed = Date.now() - unknownStart;

      usersRepository.findByEmail.mockResolvedValue(buildUser());
      const knownStart = Date.now();
      await authService.forgotPassword('jane@example.com');
      const knownElapsed = Date.now() - knownStart;

      // A little slack: setTimeout is allowed to fire a tick early.
      expect(unknownElapsed).toBeGreaterThanOrEqual(240);
      expect(knownElapsed).toBeGreaterThanOrEqual(240);
    });

    it('does not wait for the reset row or the email before answering', async () => {
      // The floor alone is not the fix, and this is the test that says so.
      // With mocked repositories every write is instant, so a test that only
      // measures elapsed time passes even if the work is awaited — which is
      // exactly how a 3x gap survived against the real database, where the
      // insert and the audit write cost ~500ms.
      //
      // So assert the property instead: hang the reset insert forever and
      // require the endpoint to answer anyway.
      usersRepository.findByEmail.mockResolvedValue(buildUser());
      passwordResetsRepository.create.mockReturnValue(new Promise(() => {}));

      await expect(authService.forgotPassword('jane@example.com')).resolves.toBeUndefined();
    });
  });

  describe('verifyEmail', () => {
    it('rejects an unknown token', async () => {
      verificationTokensRepository.findByTokenHash.mockResolvedValue(null);

      await expect(authService.verifyEmail('raw-token')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('rejects a token that exists but has expired', async () => {
      verificationTokensRepository.findByTokenHash.mockResolvedValue({
        id: 'verification_1',
        userId: 'user_1',
        tokenHash: 'hash',
        expiresAt: new Date(Date.now() - 1000),
        createdAt: new Date(),
      });

      await expect(authService.verifyEmail('raw-token')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(usersRepository.markEmailVerified).not.toHaveBeenCalled();
      expect(verificationTokensRepository.deleteById).not.toHaveBeenCalled();
    });

    it('marks the user verified and deletes the token on success', async () => {
      verificationTokensRepository.findByTokenHash.mockResolvedValue({
        id: 'verification_1',
        userId: 'user_1',
        tokenHash: 'hash',
        expiresAt: new Date(Date.now() + 1000 * 60),
        createdAt: new Date(),
      });
      const verifiedAt = new Date();
      usersRepository.markEmailVerified.mockResolvedValue(
        buildUser({ email: 'jane@example.com', emailVerifiedAt: verifiedAt }),
      );

      await authService.verifyEmail('raw-token');

      expect(usersRepository.markEmailVerified).toHaveBeenCalledWith('user_1', undefined);
      expect(verificationsRepository.upsertEmailVerified).toHaveBeenCalledWith(
        'user_1',
        verifiedAt,
        undefined,
      );
      expect(verificationTokensRepository.deleteById).toHaveBeenCalledWith('verification_1');
    });

    it('marks the referral joined once the address is actually verified', async () => {
      verificationTokensRepository.findByTokenHash.mockResolvedValue({
        id: 'verification_1',
        userId: 'user_1',
        tokenHash: 'hash',
        expiresAt: new Date(Date.now() + 1000 * 60),
        createdAt: new Date(),
      });
      usersRepository.markEmailVerified.mockResolvedValue(
        buildUser({ email: 'jane@example.com', emailVerifiedAt: new Date() }),
      );

      await authService.verifyEmail('raw-token');

      expect(referralsService.handleUserJoined).toHaveBeenCalledWith('jane@example.com');
    });
  });
});
