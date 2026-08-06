import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { UsersRepository } from '../repositories/users.repository';
import { SessionsRepository } from '../repositories/sessions.repository';
import { VerificationTokensRepository } from '../repositories/verification-tokens.repository';
import { PasswordResetsRepository } from '../repositories/password-resets.repository';
import { EmailService } from '../email/email.service';
import { generateRawToken, hashToken } from '../tokens.util';
import type { RegisterDto } from '../dto/register.dto';
import type { LoginDto } from '../dto/login.dto';
import type { User } from '@marche/db';

const ACCESS_TOKEN_TTL = '15m';
export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000; // 1 hour

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  role: string;
  emailVerified: boolean;
}

function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    emailVerified: user.emailVerifiedAt !== null,
  };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly sessionsRepository: SessionsRepository,
    private readonly verificationTokensRepository: VerificationTokensRepository,
    private readonly passwordResetsRepository: PasswordResetsRepository,
    private readonly emailService: EmailService,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto): Promise<PublicUser> {
    const existing = await this.usersRepository.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    const passwordHash = await argon2.hash(dto.password);
    const user = await this.usersRepository.create({
      email: dto.email,
      passwordHash,
      name: dto.name,
      role: dto.role,
    });

    await this.issueVerificationToken(user);

    return toPublicUser(user);
  }

  async login(
    dto: LoginDto,
    context: { userAgent?: string; ipAddress?: string },
  ): Promise<AuthTokens & { user: PublicUser }> {
    const user = await this.usersRepository.findByEmail(dto.email);
    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const passwordMatches = await argon2.verify(user.passwordHash, dto.password);
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (user.status !== 'ACTIVE' || user.deletedAt) {
      throw new UnauthorizedException('This account is not active');
    }

    const tokens = await this.issueSession(user, context);
    return { ...tokens, user: toPublicUser(user) };
  }

  async refresh(
    rawRefreshToken: string,
    context: { userAgent?: string; ipAddress?: string },
  ): Promise<AuthTokens> {
    const refreshTokenHash = hashToken(rawRefreshToken);
    const session = await this.sessionsRepository.findActiveByRefreshTokenHash(refreshTokenHash);
    if (!session) {
      throw new UnauthorizedException('Session expired or invalid');
    }

    const user = await this.usersRepository.findById(session.userId);
    if (!user || user.status !== 'ACTIVE' || user.deletedAt) {
      throw new UnauthorizedException('This account is not active');
    }

    // Rotate: the presented refresh token is single-use.
    await this.sessionsRepository.revoke(session.id);
    return this.issueSession(user, context);
  }

  async logout(rawRefreshToken: string): Promise<void> {
    const refreshTokenHash = hashToken(rawRefreshToken);
    const session = await this.sessionsRepository.findActiveByRefreshTokenHash(refreshTokenHash);
    if (session) {
      await this.sessionsRepository.revoke(session.id);
    }
  }

  async forgotPassword(email: string): Promise<void> {
    const user = await this.usersRepository.findByEmail(email);
    // Always resolve silently — confirming whether an email exists is a
    // user-enumeration leak.
    if (!user) {
      return;
    }

    const rawToken = generateRawToken();
    await this.passwordResetsRepository.create({
      userId: user.id,
      tokenHash: hashToken(rawToken),
      expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
    });
    await this.emailService.sendPasswordResetEmail(user.email, rawToken);
  }

  async resetPassword(rawToken: string, newPassword: string): Promise<void> {
    const tokenHash = hashToken(rawToken);
    const resetRequest = await this.passwordResetsRepository.findByTokenHash(tokenHash);

    if (!resetRequest || resetRequest.usedAt || resetRequest.expiresAt < new Date()) {
      throw new UnauthorizedException('This password reset link is invalid or has expired');
    }

    const passwordHash = await argon2.hash(newPassword);
    await this.usersRepository.updatePasswordHash(resetRequest.userId, passwordHash);
    await this.passwordResetsRepository.markUsed(resetRequest.id);
    // A password reset invalidates every existing session as a precaution.
    await this.sessionsRepository.revokeAllForUser(resetRequest.userId);
  }

  async verifyEmail(rawToken: string): Promise<void> {
    const tokenHash = hashToken(rawToken);
    const verification = await this.verificationTokensRepository.findByTokenHash(tokenHash);

    if (!verification || verification.expiresAt < new Date()) {
      throw new UnauthorizedException('This verification link is invalid or has expired');
    }

    await this.usersRepository.markEmailVerified(verification.userId);
    await this.verificationTokensRepository.deleteById(verification.id);
  }

  private async issueVerificationToken(user: User): Promise<void> {
    const rawToken = generateRawToken();
    await this.verificationTokensRepository.create({
      userId: user.id,
      tokenHash: hashToken(rawToken),
      expiresAt: new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS),
    });
    await this.emailService.sendVerificationEmail(user.email, rawToken);
  }

  private async issueSession(
    user: User,
    context: { userAgent?: string; ipAddress?: string },
  ): Promise<AuthTokens> {
    const accessToken = await this.jwtService.signAsync(
      { sub: user.id, role: user.role },
      { expiresIn: ACCESS_TOKEN_TTL },
    );

    const rawRefreshToken = generateRawToken();
    await this.sessionsRepository.create({
      userId: user.id,
      refreshTokenHash: hashToken(rawRefreshToken),
      userAgent: context.userAgent,
      ipAddress: context.ipAddress,
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
    });

    return { accessToken, refreshToken: rawRefreshToken };
  }
}
