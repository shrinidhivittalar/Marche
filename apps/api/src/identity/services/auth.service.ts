import { ConflictException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { randomBytes } from 'node:crypto';
import { UsersRepository, type UserWithCapabilities } from '../repositories/users.repository';
import { SessionsRepository } from '../repositories/sessions.repository';
import { VerificationTokensRepository } from '../repositories/verification-tokens.repository';
import { VerificationsRepository } from '../repositories/verifications.repository';
import { AuthenticationMethodsRepository } from '../repositories/authentication-methods.repository';
import { PasswordResetsRepository } from '../repositories/password-resets.repository';
import { EmailService } from '../../email/email.service';
import { generateRawToken, hashToken } from '../tokens.util';
import { AuditService } from '../../audit/audit.service';
import { AUTH_EVENTS } from '../audit-events';
import { ProfilesService } from '../../profiles/services/profiles.service';
import { ReferralsService } from '../../referrals/services/referrals.service';
import { PrismaService } from '../../prisma/prisma.service';
import { GoogleAuthVerifier } from '../google-auth-verifier';
import type { RegisterDto } from '../dto/register.dto';
import type { LoginDto } from '../dto/login.dto';
import type { Capability, User } from '@marche/db';

// Postgres' unique-violation code — same duck-typed check already used in
// skills.service.ts, proposals.service.ts, etc.
const UNIQUE_VIOLATION = 'P2002';

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === UNIQUE_VIOLATION
  );
}

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

// Same floor, same reasoning, applied to register()'s sibling gap: the
// duplicate branch (SELECT + email + audit, detached) is otherwise
// measurably faster than the new-account branch (SELECT + 4-statement
// $transaction + verification token + audit, awaited — has to be, so the
// response can't claim an account exists before it does), which lets
// response timing answer the same "is this email registered" question the
// identical response body was meant to hide. Set higher than
// FORGOT_PASSWORD_FLOOR_MS because unlike that path, this floor has to
// cover real awaited DB work, not just a detached one. Untuned — a rough
// ceiling on the awaited chain's cost, not measured against production
// latency.
const REGISTER_FLOOR_MS = 750;

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
  // The caller's own DB-backed capabilities (Module 01 Slice 2), added so
  // the frontend can hold them as session state — until now they existed
  // on request.user server-side (JwtStrategy.validate) but were dropped
  // before serialization, leaving the client with only the legacy scalar
  // role. Informational only: authorization stays server-side through
  // hasCapability()/assertProviderRole()/assertClientRole(), which read the
  // database per request and never trust anything the client sends back.
  capabilities: Capability[];
}

export interface RegisterResult {
  status: 'verification_email_sent';
}

const REGISTER_ACKNOWLEDGEMENT: RegisterResult = { status: 'verification_email_sent' };

// Takes UserWithCapabilities, not User, deliberately: every path that
// produces this response body must have loaded the capability rows. A
// looser signature (capabilities optional, defaulted to []) would let a
// caller that forgot to include them return "this user has no
// capabilities" — indistinguishable from the truth, and wrong. Requiring
// the loaded shape makes that a compile error instead, the same reasoning
// as ProfilesRepository.withDetails's required viewerIsOwner argument.
export function toPublicUser(user: UserWithCapabilities): PublicUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    emailVerified: user.emailVerifiedAt !== null,
    capabilities: user.capabilities.map((row) => row.capability),
  };
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly sessionsRepository: SessionsRepository,
    private readonly verificationTokensRepository: VerificationTokensRepository,
    private readonly verificationsRepository: VerificationsRepository,
    private readonly authenticationMethodsRepository: AuthenticationMethodsRepository,
    private readonly passwordResetsRepository: PasswordResetsRepository,
    private readonly emailService: EmailService,
    private readonly jwtService: JwtService,
    private readonly auditService: AuditService,
    private readonly profilesService: ProfilesService,
    private readonly referralsService: ReferralsService,
    private readonly prisma: PrismaService,
    private readonly googleAuthVerifier: GoogleAuthVerifier,
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
    return notBefore(REGISTER_FLOOR_MS, this.performRegister(dto));
  }

  private async performRegister(dto: RegisterDto): Promise<RegisterResult> {
    const existing = await this.usersRepository.findByEmail(dto.email);
    // Hashed on both branches: argon2 dominates this request's cost, so
    // skipping it for a duplicate would replace the status-code oracle with
    // an equally readable timing one.
    const passwordHash = await argon2.hash(dto.password);

    if (existing) {
      // Detached, same as forgotPassword: nothing past the lookup+hash is
      // awaited, so both branches return at the same point regardless of
      // how long the email send or audit write happens to take.
      void this.notifyDuplicateRegistration(existing).catch((error: unknown) =>
        this.logger.error(`Duplicate registration notice failed: ${String(error)}`),
      );
      return REGISTER_ACKNOWLEDGEMENT;
    }

    // Unlike the duplicate branch above, this one has to actually exist by
    // the time the response goes out — the account is the whole point of the
    // endpoint, so it must be awaited, not detached.
    await this.createRegisteredUser(dto, passwordHash);

    return REGISTER_ACKNOWLEDGEMENT;
  }

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
  private async notifyDuplicateRegistration(existing: User): Promise<void> {
    await this.emailService.sendDuplicateRegistrationEmail(existing.email);
    await this.auditService.record({
      eventType: AUTH_EVENTS.REGISTER_DUPLICATE,
      userId: existing.id,
      email: existing.email,
    });
  }

  private async createRegisteredUser(dto: RegisterDto, passwordHash: string): Promise<void> {
    // User + Profile + initial UserCapability must be created together: if
    // the process dies partway, a user with no profile or no capability row
    // breaks downstream profile/authorization endpoints. The capability
    // granted mirrors dto.role exactly (CLIENT|PROVIDER) — RegisterDto has
    // no ADMIN/SUPER_ADMIN option and no platformRole field, so a public
    // signup can never produce anything but a USER-platformRole identity
    // with exactly one capability (module1-implementation-contract.md §5, §2.2).
    const user = await this.prisma.client.$transaction(async (tx) => {
      const created = await this.usersRepository.create(
        { email: dto.email, passwordHash, name: dto.name, role: dto.role },
        tx,
      );
      await this.profilesService.createForNewUser(created.id, created.name, tx);
      await this.usersRepository.grantCapability(created.id, dto.role, tx);
      // Module 01 Slice 7: keeps AuthenticationMethod a complete ledger
      // going forward, not just backfilled once at migration time — every
      // new password registrant gets its EMAIL_PASSWORD row the same way
      // every pre-existing user got one from the migration's backfill.
      await this.authenticationMethodsRepository.createEmailPassword(created.id, tx);
      return created;
    });

    await this.issueVerificationToken(user);
    await this.auditService.record({
      eventType: AUTH_EVENTS.REGISTER,
      userId: user.id,
      email: user.email,
      metadata: { role: user.role },
    });

    // Referral JOINED status is handled on email verification (see
    // verifyEmail below), not here — registering alone doesn't prove the
    // address belongs to whoever submitted it, and marking a referral
    // joined off an unverified registration would let anyone spoof a
    // referral by registering with an email they don't own.
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
      await this.handlePossibleRefreshReuse(refreshTokenHash, context);
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

  // Rotation is single-use, so a hash that exists but is already revoked
  // means someone is replaying a refresh token that was already exchanged
  // for its successor — the legitimate holder has moved on. That only
  // happens if the token was stolen. Kills every session for the account,
  // the same precaution a password reset already takes, and leaves an audit
  // trail so the theft is visible instead of silent.
  private async handlePossibleRefreshReuse(
    refreshTokenHash: string,
    context: RequestContext,
  ): Promise<void> {
    const stale = await this.sessionsRepository.findByRefreshTokenHash(refreshTokenHash);
    if (!stale?.revokedAt) return;

    await this.sessionsRepository.revokeAllForUser(stale.userId);
    await this.auditService.record({
      eventType: AUTH_EVENTS.REFRESH_TOKEN_REUSE,
      userId: stale.userId,
      ...context,
    });
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

    // module1-implementation-contract.md §8.2: Verification becomes the
    // write-side system of record the moment anything sets
    // emailVerifiedAt, so the two are written together, in the same
    // transaction, rather than emailVerifiedAt alone.
    const user = await this.prisma.client.$transaction(async (tx) => {
      const updated = await this.usersRepository.markEmailVerified(verification.userId, tx);
      await this.verificationsRepository.upsertEmailVerified(
        verification.userId,
        updated.emailVerifiedAt!,
        tx,
      );
      return updated;
    });
    await this.verificationTokensRepository.deleteById(verification.id);
    await this.auditService.record({
      eventType: AUTH_EVENTS.EMAIL_VERIFIED,
      userId: verification.userId,
    });

    // Moved here from register(): this is the point the address is
    // actually proven to belong to whoever signed up, which is what a
    // referral's JOINED status is supposed to mean.
    await this.referralsService.handleUserJoined(user.email);
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

  // module1-implementation-contract.md §7.2 — three-way branch, exactly:
  //   sub already linked            -> authenticate that User
  //   sub unlinked, email taken     -> conflict, never silently link
  //   sub unlinked, email unused    -> create a new User atomically
  // idToken is verified server-side before any of the three paths runs —
  // sub/email/emailVerified are the only fields ever read from it.
  async googleLogin(
    idToken: string,
    context: RequestContext,
  ): Promise<(AuthTokens & { user: PublicUser }) | RegisterResult> {
    const identity = await this.googleAuthVerifier.verify(idToken);

    const existingMethod = await this.authenticationMethodsRepository.findByGoogleSub(identity.sub);
    if (existingMethod) {
      const user = await this.usersRepository.findById(existingMethod.userId);
      if (!user || user.status !== 'ACTIVE' || user.deletedAt) {
        throw new UnauthorizedException('This account is not active');
      }
      const tokens = await this.issueSession(user, context);
      await this.auditService.record({
        eventType: AUTH_EVENTS.GOOGLE_LOGIN_EXISTING_USER,
        userId: user.id,
        email: user.email,
        ...context,
      });
      return { ...tokens, user: toPublicUser(user) };
    }

    const existingUserByEmail = await this.usersRepository.findByEmail(identity.email);
    if (existingUserByEmail) {
      // Deliberately not linked here — module1-implementation-contract.md
      // §7.2's explicit rule: an email match alone is never proof of
      // ownership. The caller is told to log in with their existing method
      // and link Google from an authenticated session (googleLink below).
      await this.auditService.record({
        eventType: AUTH_EVENTS.GOOGLE_EMAIL_COLLISION,
        userId: existingUserByEmail.id,
        email: identity.email,
        ...context,
      });
      throw new ConflictException(
        'An account with this email already exists. Log in with your password, then link Google from your account.',
      );
    }

    // New user: User + Profile + AuthenticationMethod(GOOGLE), atomically.
    // No capability granted — authentication is not marketplace intent
    // (module1-implementation-contract.md §7.2's explicit deferral to a
    // follow-up capability-activation step, same endpoint Slice 3 built
    // for password registrants who want a second capability).
    //
    // passwordHash is a random value nobody knows, not a placeholder that
    // could ever accidentally validate — this account has no password
    // login until/unless one is set through a separate flow (not built in
    // this slice), and User.passwordHash has no nullable variant to avoid
    // a broader schema change for a Google-only account.
    const user = await this.prisma.client.$transaction(
      async (tx) => {
        const unusablePasswordHash = await argon2.hash(randomBytes(32).toString('hex'));
        const displayName = identity.email.split('@')[0]!;
        const created = await this.usersRepository.create(
          {
            email: identity.email,
            passwordHash: unusablePasswordHash,
            name: displayName,
            role: 'CLIENT',
          },
          tx,
        );
        await this.profilesService.createForNewUser(created.id, displayName, tx);
        await this.authenticationMethodsRepository.createGoogle(created.id, identity.sub, tx);
        if (identity.emailVerified) {
          // Google already proved this address — no reason to also make the
          // user click a verification email (module1-implementation-contract.md
          // §7.2). Both representations written together, in the same
          // transaction, per §8.2's write-path rule.
          const verified = await this.usersRepository.markEmailVerified(created.id, tx);
          await this.verificationsRepository.upsertEmailVerified(
            created.id,
            verified.emailVerifiedAt!,
            tx,
          );
          return verified;
        }
        return created;
      },
      // Same override, for the same reason, as ProposalsService.accept —
      // see the longer note there. Prisma's default interactive-transaction
      // timeout is 5s, and this body spends it on work that is legitimately
      // slow rather than stuck: an argon2 hash (deliberately expensive) plus
      // five sequential round trips to a hosted database, each carrying real
      // network latency. That total sat just under the default, which is the
      // worst place to be — it passed often enough to look fine and then
      // 500'd on a new user's very first Google sign-up. Module 2 Slice A's
      // capability includes on create/markEmailVerified added enough to that
      // total to push it over consistently.
      //
      // Raised rather than shrunk by dropping those includes: the response
      // genuinely needs the capability rows, and the includes are correct.
      // Nothing in here is unsafe to wait for either — atomicity is what the
      // transaction is for, and the account must not half-exist.
      //
      // The lasting fix is fewer round trips in here (the argon2 hash in
      // particular does not need to hold a transaction open), which is a
      // change to how this write is expressed and does not belong in the
      // commit that found the problem.
      { timeout: 15_000, maxWait: 5_000 },
    );

    await this.auditService.record({
      eventType: AUTH_EVENTS.GOOGLE_LOGIN_NEW_USER,
      userId: user.id,
      email: user.email,
      ...context,
    });

    if (!identity.emailVerified) {
      // Rare — Google accounts are themselves email-verified in the
      // overwhelming majority of cases — but not impossible, and this
      // keeps the two signup paths' security property identical rather
      // than special-casing OAuth to skip it: same as password
      // registration, the account exists but gets no session until the
      // address is proven. Unlike leaving the caller stuck with a created,
      // unverifiable account, this issues the same verification-token/
      // email flow register() does, so there is still a way forward.
      await this.issueVerificationToken(user);
      return REGISTER_ACKNOWLEDGEMENT;
    }

    const tokens = await this.issueSession(user, context);
    return { ...tokens, user: toPublicUser(user) };
  }

  // Self-service only — always the caller's own userId, never a target
  // parameter (module1-implementation-contract.md §7.2). Idempotent:
  // relinking the same Google account to the same User is a no-op success.
  async linkGoogleAccount(userId: string, idToken: string): Promise<{ linked: true }> {
    const identity = await this.googleAuthVerifier.verify(idToken);

    const existingMethod = await this.authenticationMethodsRepository.findByGoogleSub(identity.sub);
    if (existingMethod) {
      if (existingMethod.userId === userId) {
        return { linked: true };
      }
      throw new ConflictException('This Google account is already linked to a different account');
    }

    try {
      await this.authenticationMethodsRepository.createGoogle(userId, identity.sub);
    } catch (error) {
      if (!isUniqueViolation(error)) {
        throw error;
      }
      // Raced with another request linking the same sub (or the same user
      // linking twice) between the read above and this write.
      const winner = await this.authenticationMethodsRepository.findByGoogleSub(identity.sub);
      if (winner?.userId === userId) {
        return { linked: true };
      }
      throw new ConflictException('This Google account is already linked to a different account');
    }

    await this.auditService.record({
      eventType: AUTH_EVENTS.GOOGLE_LINKED,
      userId,
      metadata: { googleSub: identity.sub },
    });
    return { linked: true };
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
