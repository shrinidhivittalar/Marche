import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { UsersRepository } from '../repositories/users.repository';
import { SessionsRepository } from '../repositories/sessions.repository';
import { VerificationTokensRepository } from '../repositories/verification-tokens.repository';
import { PasswordResetsRepository } from '../repositories/password-resets.repository';
import { EmailService } from '../email/email.service';
import { generateRawToken, hashToken } from '../tokens.util';
import { AuditService } from '../../audit/audit.service';
import { AUTH_EVENTS } from '../audit-events';
import { ProfilesService } from '../../profiles/services/profiles.service';
import { PrismaService } from '../../prisma/prisma.service';
import type { RegisterDto } from '../dto/register.dto';
import type { LoginDto } from '../dto/login.dto';
import type { User } from '@marche/db';

type RequestContext = { userAgent?: string; ipAddress?: string };

const ACCESS_TOKEN_TTL = '15m';
export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000; // 1 hour

// Used to pay the same argon2 cost on an unknown-email login attempt as a
// known one, so response timing doesn't reveal whether an email is registered.
const DUMMY_PASSWORD_HASH = argon2.hash('dummy-password-for-timing-parity');

// Floor that both branches of forgot-password are held to.
//
// Secondary, not the mechanism: both branches now do exactly one indexed
// SELECT and detach the rest, so they already cost the same. This covers the
// residual — a cache-warm lookup on one call and a cold one on the next.
//
// A fixed floor rather than random jitter on purpose: jitter only widens the
// distribution, so an attacker averaging enough samples still recovers the
// mean, while a floor makes every response the same length until the work
// exceeds it.
const FORGOT_PASSWORD_FLOOR_MS = 250;

async function notBefore<T>(floorMs: number, work: Promise<T>): Promise<T> {
  const [result] = await Promise.all([
    work,
    new Promise((resolve) => setTimeout(resolve, floorMs)),
  ]);
  return result;
}

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

export interface RegisterResult {
  status: 'verification_email_sent';
}

const REGISTER_ACKNOWLEDGEMENT: RegisterResult = { status: 'verification_email_sent' };

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
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly sessionsRepository: SessionsRepository,
    private readonly verificationTokensRepository: VerificationTokensRepository,
    private readonly passwordResetsRepository: PasswordResetsRepository,
    private readonly emailService: EmailService,
    private readonly jwtService: JwtService,
    private readonly auditService: AuditService,
    private readonly profilesService: ProfilesService,
    private readonly prisma: PrismaService,
  ) {}

  // Deliberately returns the same status and the same body whether or not the
  // address was already registered. Answering "409, that email is taken" turns
  // the endpoint into a free membership oracle — anyone can test a list of
  // addresses against the site — and it undoes the care taken in login and
  // forgot-password, which are already non-disclosing. The real owner is told
  // instead, by email, that someone tried to sign up with their address, which
  // is the only party entitled to that information.
  //
  // The body is a fixed acknowledgement rather than the created user because
  // the duplicate branch has no user it is allowed to describe, and inventing
  // plausible-looking fields would be a lie the frontend could act on.
  async register(dto: RegisterDto): Promise<RegisterResult> {
    const existing = await this.usersRepository.findByEmail(dto.email);
    // Hashed on both branches: argon2 dominates this request's cost, so
    // skipping it for a duplicate would replace the status-code oracle with
    // an equally readable timing one.
    const passwordHash = await argon2.hash(dto.password);

    if (existing) {
      await this.emailService.sendDuplicateRegistrationEmail(existing.email);
      await this.auditService.record({
        eventType: AUTH_EVENTS.REGISTER_DUPLICATE,
        userId: existing.id,
        email: existing.email,
      });
      return REGISTER_ACKNOWLEDGEMENT;
    }

    // User + Profile must be created together: if the process dies between
    // them, a user with no profile breaks every downstream profile endpoint.
    const user = await this.prisma.client.$transaction(async (tx) => {
      const created = await this.usersRepository.create(
        { email: dto.email, passwordHash, name: dto.name, role: dto.role },
        tx,
      );
      await this.profilesService.createForNewUser(created.id, created.name, tx);
      return created;
    });

    await this.issueVerificationToken(user);
    await this.auditService.record({
      eventType: AUTH_EVENTS.REGISTER,
      userId: user.id,
      email: user.email,
      metadata: { role: user.role },
    });

    return REGISTER_ACKNOWLEDGEMENT;
  }

  async login(dto: LoginDto, context: RequestContext): Promise<AuthTokens & { user: PublicUser }> {
    const user = await this.usersRepository.findByEmail(dto.email);
    if (!user) {
      // Pay the same argon2 cost as a real login attempt so response timing
      // doesn't leak whether this email is registered.
      await argon2.verify(await DUMMY_PASSWORD_HASH, dto.password);
      await this.auditService.record({
        eventType: AUTH_EVENTS.LOGIN_FAILURE,
        email: dto.email,
        ...context,
        metadata: { reason: 'unknown_email' },
      });
      throw new UnauthorizedException('Invalid email or password');
    }

    const passwordMatches = await argon2.verify(user.passwordHash, dto.password);
    if (!passwordMatches) {
      await this.auditService.record({
        eventType: AUTH_EVENTS.LOGIN_FAILURE,
        userId: user.id,
        email: user.email,
        ...context,
        metadata: { reason: 'wrong_password' },
      });
      throw new UnauthorizedException('Invalid email or password');
    }

    if (user.status !== 'ACTIVE' || user.deletedAt) {
      await this.auditService.record({
        eventType: AUTH_EVENTS.LOGIN_FAILURE,
        userId: user.id,
        email: user.email,
        ...context,
        metadata: { reason: 'account_inactive', status: user.status },
      });
      throw new UnauthorizedException('This account is not active');
    }

    if (!user.emailVerifiedAt) {
      await this.auditService.record({
        eventType: AUTH_EVENTS.LOGIN_FAILURE,
        userId: user.id,
        email: user.email,
        ...context,
        metadata: { reason: 'email_not_verified' },
      });
      throw new UnauthorizedException('Please verify your email before logging in');
    }

    const tokens = await this.issueSession(user, context);
    await this.auditService.record({
      eventType: AUTH_EVENTS.LOGIN_SUCCESS,
      userId: user.id,
      email: user.email,
      ...context,
    });
    return { ...tokens, user: toPublicUser(user) };
  }

  async refresh(rawRefreshToken: string, context: RequestContext): Promise<AuthTokens> {
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
      await this.auditService.record({
        eventType: AUTH_EVENTS.LOGOUT,
        userId: session.userId,
      });
    }
  }

  // Status and body are already identical for both branches; the leak this
  // guards is duration. An unknown address used to return after a single
  // indexed SELECT, while a known one waited on an outbound HTTPS call to
  // Resend — a difference large enough to read off `curl -w %{time_total}`.
  // The fix is that no branch awaits anything beyond the lookup — the whole
  // delivery is detached — with the floor below as a second guard so that a
  // slow lookup on one branch cannot show through either.
  async forgotPassword(email: string): Promise<void> {
    await notBefore(FORGOT_PASSWORD_FLOOR_MS, this.issuePasswordReset(email));
  }

  private async issuePasswordReset(email: string): Promise<void> {
    const user = await this.usersRepository.findByEmail(email);
    // Always resolve silently — confirming whether an email exists is a
    // user-enumeration leak.
    if (!user) {
      return;
    }

    // Everything past the lookup is detached, so both branches return after
    // the same single SELECT.
    //
    // Measured, not assumed: awaiting the insert and the audit write cost a
    // known address ~750ms against the hosted database versus ~265ms for an
    // unknown one — a 3x difference readable straight off `curl -w
    // %{time_total}`, and one a fixed floor could only hide by being raised
    // above whatever the database happens to cost that day. Detaching makes
    // the response time independent of the work instead of merely larger
    // than it, so a slower database cannot quietly reopen the gap.
    //
    // Nothing in the response depends on any of it: the endpoint answers 204
    // either way, and a failure here is already log-and-continue.
    void this.deliverPasswordReset(user).catch((error: unknown) =>
      this.logger.error(`Password reset delivery failed: ${String(error)}`),
    );
  }

  private async deliverPasswordReset(user: User): Promise<void> {
    const rawToken = generateRawToken();
    // Written before the email is sent, so a link can never arrive before the
    // row it depends on exists.
    await this.passwordResetsRepository.create({
      userId: user.id,
      tokenHash: hashToken(rawToken),
      expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
    });
    await this.emailService.sendPasswordResetEmail(user.email, rawToken);
    await this.auditService.record({
      eventType: AUTH_EVENTS.PASSWORD_RESET_REQUESTED,
      userId: user.id,
      email: user.email,
    });
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
    await this.auditService.record({
      eventType: AUTH_EVENTS.PASSWORD_RESET_COMPLETED,
      userId: resetRequest.userId,
    });
  }

  async verifyEmail(rawToken: string): Promise<void> {
    const tokenHash = hashToken(rawToken);
    const verification = await this.verificationTokensRepository.findByTokenHash(tokenHash);

    if (!verification || verification.expiresAt < new Date()) {
      throw new UnauthorizedException('This verification link is invalid or has expired');
    }

    await this.usersRepository.markEmailVerified(verification.userId);
    await this.verificationTokensRepository.deleteById(verification.id);
    await this.auditService.record({
      eventType: AUTH_EVENTS.EMAIL_VERIFIED,
      userId: verification.userId,
    });
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

  private async issueSession(user: User, context: RequestContext): Promise<AuthTokens> {
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
