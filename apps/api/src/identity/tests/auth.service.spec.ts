import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { AuthService } from '../services/auth.service';
import type { UsersRepository } from '../repositories/users.repository';
import type { SessionsRepository } from '../repositories/sessions.repository';
import type { VerificationTokensRepository } from '../repositories/verification-tokens.repository';
import type { PasswordResetsRepository } from '../repositories/password-resets.repository';
import type { EmailService } from '../email/email.service';
import type { AuditService } from '../../audit/audit.service';
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
  let passwordResetsRepository: jest.Mocked<PasswordResetsRepository>;
  let emailService: jest.Mocked<EmailService>;
  let auditService: jest.Mocked<AuditService>;
  let authService: AuthService;

  beforeEach(() => {
    usersRepository = {
      findByEmail: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      markEmailVerified: jest.fn(),
      updatePasswordHash: jest.fn(),
    } as unknown as jest.Mocked<UsersRepository>;

    sessionsRepository = {
      create: jest.fn(),
      findActiveByRefreshTokenHash: jest.fn(),
      revoke: jest.fn(),
      revokeAllForUser: jest.fn(),
    } as unknown as jest.Mocked<SessionsRepository>;

    verificationTokensRepository = {
      create: jest.fn(),
      findByTokenHash: jest.fn(),
      deleteById: jest.fn(),
    } as unknown as jest.Mocked<VerificationTokensRepository>;

    passwordResetsRepository = {
      create: jest.fn(),
      findByTokenHash: jest.fn(),
      markUsed: jest.fn(),
    } as unknown as jest.Mocked<PasswordResetsRepository>;

    emailService = {
      sendVerificationEmail: jest.fn(),
      sendPasswordResetEmail: jest.fn(),
    } as unknown as jest.Mocked<EmailService>;

    auditService = {
      record: jest.fn(),
    } as unknown as jest.Mocked<AuditService>;

    authService = new AuthService(
      usersRepository,
      sessionsRepository,
      verificationTokensRepository,
      passwordResetsRepository,
      emailService,
      new JwtService({ secret: 'test-secret' }),
      auditService,
    );
  });

  describe('register', () => {
    it('rejects a duplicate email', async () => {
      usersRepository.findByEmail.mockResolvedValue(buildUser());

      await expect(
        authService.register({
          email: 'jane@example.com',
          password: 'password123',
          name: 'Jane',
          role: 'CLIENT',
        }),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(usersRepository.create).not.toHaveBeenCalled();
    });

    it('creates the user, hashes the password, and sends a verification email', async () => {
      usersRepository.findByEmail.mockResolvedValue(null);
      const created = buildUser();
      usersRepository.create.mockResolvedValue(created);

      const result = await authService.register({
        email: 'jane@example.com',
        password: 'password123',
        name: 'Jane',
        role: 'CLIENT',
      });

      expect(usersRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'jane@example.com', name: 'Jane', role: 'CLIENT' }),
      );
      const storedHash = usersRepository.create.mock.calls[0]![0].passwordHash;
      expect(await argon2.verify(storedHash, 'password123')).toBe(true);
      expect(emailService.sendVerificationEmail).toHaveBeenCalledWith(
        'jane@example.com',
        expect.any(String),
      );
      expect(result).toEqual(expect.objectContaining({ id: created.id, emailVerified: false }));
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'auth.register', userId: created.id }),
      );
    });
  });

  describe('login', () => {
    it('rejects an unknown email', async () => {
      usersRepository.findByEmail.mockResolvedValue(null);

      await expect(
        authService.login({ email: 'jane@example.com', password: 'password123' }, {}),
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
      const passwordHash = await argon2.hash('password123');
      usersRepository.findByEmail.mockResolvedValue(
        buildUser({ passwordHash, status: 'SUSPENDED' }),
      );

      await expect(
        authService.login({ email: 'jane@example.com', password: 'password123' }, {}),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects a disabled account', async () => {
      const passwordHash = await argon2.hash('password123');
      usersRepository.findByEmail.mockResolvedValue(
        buildUser({ passwordHash, status: 'DISABLED' }),
      );

      await expect(
        authService.login({ email: 'jane@example.com', password: 'password123' }, {}),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects a soft-deleted account even if status still reads ACTIVE', async () => {
      const passwordHash = await argon2.hash('password123');
      usersRepository.findByEmail.mockResolvedValue(
        buildUser({ passwordHash, deletedAt: new Date() }),
      );

      await expect(
        authService.login({ email: 'jane@example.com', password: 'password123' }, {}),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects an empty password against a real hash rather than throwing unhandled', async () => {
      const passwordHash = await argon2.hash('password123');
      usersRepository.findByEmail.mockResolvedValue(buildUser({ passwordHash }));

      await expect(
        authService.login({ email: 'jane@example.com', password: '' }, {}),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('issues tokens and creates a session on success', async () => {
      const passwordHash = await argon2.hash('password123');
      usersRepository.findByEmail.mockResolvedValue(buildUser({ passwordHash }));

      const result = await authService.login(
        { email: 'jane@example.com', password: 'password123' },
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

      await expect(
        authService.resetPassword('raw-token', 'new-password123'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
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

      await expect(
        authService.resetPassword('raw-token', 'new-password123'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(usersRepository.updatePasswordHash).not.toHaveBeenCalled();
    });

    it('rejects an unknown token', async () => {
      passwordResetsRepository.findByTokenHash.mockResolvedValue(null);

      await expect(
        authService.resetPassword('garbage-token', 'new-password123'),
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

      await authService.resetPassword('raw-token', 'new-password123');

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

      await expect(authService.refresh('raw-token', {})).rejects.toBeInstanceOf(
        UnauthorizedException,
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

      await authService.verifyEmail('raw-token');

      expect(usersRepository.markEmailVerified).toHaveBeenCalledWith('user_1');
      expect(verificationTokensRepository.deleteById).toHaveBeenCalledWith('verification_1');
    });
  });
});
