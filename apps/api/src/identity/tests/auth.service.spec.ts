import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { AuthService } from '../services/auth.service';
import type { UsersRepository } from '../repositories/users.repository';
import type { SessionsRepository } from '../repositories/sessions.repository';
import type { VerificationTokensRepository } from '../repositories/verification-tokens.repository';
import type { PasswordResetsRepository } from '../repositories/password-resets.repository';
import type { EmailService } from '../email/email.service';
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

    authService = new AuthService(
      usersRepository,
      sessionsRepository,
      verificationTokensRepository,
      passwordResetsRepository,
      emailService,
      new JwtService({ secret: 'test-secret' }),
    );
  });

  describe('register', () => {
    it('rejects a duplicate email', async () => {
      usersRepository.findByEmail.mockResolvedValue(buildUser());

      await expect(
        authService.register({ email: 'jane@example.com', password: 'password123', name: 'Jane', role: 'CLIENT' }),
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
      expect(emailService.sendVerificationEmail).toHaveBeenCalledWith('jane@example.com', expect.any(String));
      expect(result).toEqual(expect.objectContaining({ id: created.id, emailVerified: false }));
    });
  });

  describe('login', () => {
    it('rejects an unknown email', async () => {
      usersRepository.findByEmail.mockResolvedValue(null);

      await expect(
        authService.login({ email: 'jane@example.com', password: 'password123' }, {}),
      ).rejects.toBeInstanceOf(UnauthorizedException);
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
      usersRepository.findByEmail.mockResolvedValue(buildUser({ passwordHash, status: 'SUSPENDED' }));

      await expect(
        authService.login({ email: 'jane@example.com', password: 'password123' }, {}),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('issues tokens and creates a session on success', async () => {
      const passwordHash = await argon2.hash('password123');
      usersRepository.findByEmail.mockResolvedValue(buildUser({ passwordHash }));

      const result = await authService.login({ email: 'jane@example.com', password: 'password123' }, {});

      expect(result.accessToken).toEqual(expect.any(String));
      expect(result.refreshToken).toEqual(expect.any(String));
      expect(sessionsRepository.create).toHaveBeenCalledTimes(1);
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

      await expect(authService.resetPassword('raw-token', 'new-password123')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
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
});
