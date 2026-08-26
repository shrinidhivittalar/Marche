import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { Prisma, User, UserCapability, UserRole } from '@marche/db';

// findById's return shape, with capabilities attached — see the comment on
// findById below for why. Everything that already only reads the plain
// User fields (AuthService.refresh, UsersService) keeps working unchanged;
// this is additive.
export type UserWithCapabilities = User & { capabilities: UserCapability[] };

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
}
