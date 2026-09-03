import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type {
  Capability,
  PlatformRole,
  Prisma,
  User,
  UserCapability,
  UserRole,
  UserStatus,
} from '@marche/db';

// findById's return shape, with capabilities attached — see the comment on
// findById below for why. Everything that already only reads the plain
// User fields (AuthService.refresh, UsersService) keeps working unchanged;
// this is additive.
export type UserWithCapabilities = User & { capabilities: UserCapability[] };

// Postgres' unique-violation code, surfaced by Prisma — same duck-typed
// check already used in skills.service.ts, proposals.service.ts, etc.
const UNIQUE_VIOLATION = 'P2002';

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === UNIQUE_VIOLATION
  );
}

@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  // Capabilities are included for the same reason findById includes them:
  // this is the read behind password login, and login's response body now
  // carries the caller's capabilities (AuthService.toPublicUser) so the
  // frontend can hold them as session state. Additive — the callers that
  // only read plain User fields (the register duplicate-check,
  // forgotPassword, googleLogin's email-collision check) are unaffected.
  findByEmail(email: string): Promise<UserWithCapabilities | null> {
    return this.prisma.client.user.findUnique({
      where: { email },
      include: { capabilities: true },
    });
  }

  // Capabilities are included here, not fetched separately, because this is
  // the one method called on every authenticated request (JwtStrategy.validate
  // re-fetches the user from the database on every request already, to keep
  // User.status live — see that file). Loading capabilities in the same
  // query, rather than adding a second one, keeps that per-request cost from
  // Module 01 Slice 2's authorization additions.
  findById(id: string): Promise<UserWithCapabilities | null> {
    return this.prisma.client.user.findUnique({
      where: { id },
      include: { capabilities: true },
    });
  }

  // Both of these include capabilities so their result satisfies
  // toPublicUser, which googleLogin's new-user path hands them to directly.
  // For a user this call just created the relation is genuinely empty
  // rather than assumed empty — read back from the database like every
  // other capability read, instead of hardcoding [] on the belief that
  // nothing in that transaction granted one.
  create(
    data: { email: string; passwordHash: string; name: string; role: UserRole },
    tx?: Prisma.TransactionClient,
  ): Promise<UserWithCapabilities> {
    return (tx ?? this.prisma.client).user.create({ data, include: { capabilities: true } });
  }

  markEmailVerified(userId: string, tx?: Prisma.TransactionClient): Promise<UserWithCapabilities> {
    return (tx ?? this.prisma.client).user.update({
      where: { id: userId },
      data: { emailVerifiedAt: new Date() },
      include: { capabilities: true },
    });
  }

  updatePasswordHash(userId: string, passwordHash: string): Promise<User> {
    return this.prisma.client.user.update({
      where: { id: userId },
      data: { passwordHash },
    });
  }

  // Idempotent grant: (userId, capability) is unique at the database level
  // (schema.prisma's UserCapability.@@unique), so a retried or concurrently
  // racing grant for the same pair falls into the catch below and returns
  // the row the other writer already created, rather than erroring or
  // producing a duplicate — module1-implementation-contract.md §2.3, §10.
  // Used both by AuthService.register (inside the registration transaction,
  // where a collision is impossible for a brand-new user) and by capability
  // activation (where it's the actual idempotency mechanism).
  async grantCapability(
    userId: string,
    capability: Capability,
    tx?: Prisma.TransactionClient,
  ): Promise<UserCapability> {
    const client = tx ?? this.prisma.client;
    try {
      return await client.userCapability.create({ data: { userId, capability } });
    } catch (error) {
      if (!isUniqueViolation(error)) {
        throw error;
      }
      const existing = await client.userCapability.findUnique({
        where: { userId_capability: { userId, capability } },
      });
      if (!existing) {
        throw error;
      }
      return existing;
    }
  }

  countByPlatformRole(platformRole: PlatformRole): Promise<number> {
    return this.prisma.client.user.count({ where: { platformRole, deletedAt: null } });
  }

  // Conditional update, same pattern as JobsRepository.claimFilled: the
  // WHERE clause includes the caller's last-read platformRole, so a
  // concurrent change to the same row between read and write makes this a
  // no-op (count 0) rather than silently overwriting a decision made in
  // between — AdminService.changePlatformRole treats 0 as a conflict to
  // retry, not a success.
  updatePlatformRoleIfCurrent(
    userId: string,
    expectedCurrentRole: PlatformRole,
    newRole: PlatformRole,
  ): Promise<number> {
    return this.prisma.client.user
      .updateMany({
        where: { id: userId, platformRole: expectedCurrentRole },
        data: { platformRole: newRole },
      })
      .then((result) => result.count);
  }

  // Same conditional-update shape as updatePlatformRoleIfCurrent, and for
  // the same reason: AdminService.setUserStatus treats a 0 count as a
  // concurrent-change conflict to retry, not a success.
  updateStatusIfCurrent(
    userId: string,
    expectedCurrentStatus: UserStatus,
    newStatus: UserStatus,
  ): Promise<number> {
    return this.prisma.client.user
      .updateMany({
        where: { id: userId, status: expectedCurrentStatus },
        data: { status: newStatus },
      })
      .then((result) => result.count);
  }
}
