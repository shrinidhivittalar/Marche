import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { Capability, Prisma, User, UserCapability, UserRole } from '@marche/db';

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

  findByEmail(email: string): Promise<User | null> {
    return this.prisma.client.user.findUnique({ where: { email } });
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

  create(
    data: { email: string; passwordHash: string; name: string; role: UserRole },
    tx?: Prisma.TransactionClient,
  ): Promise<User> {
    return (tx ?? this.prisma.client).user.create({ data });
  }

  markEmailVerified(userId: string): Promise<User> {
    return this.prisma.client.user.update({
      where: { id: userId },
      data: { emailVerifiedAt: new Date() },
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
}
