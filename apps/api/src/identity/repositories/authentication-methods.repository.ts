import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticationMethod, Prisma } from '@marche/db';

@Injectable()
export class AuthenticationMethodsRepository {
  constructor(private readonly prisma: PrismaService) {}

  // The authoritative lookup for "does this Google account already belong
  // to someone" — AuthenticationMethod, never User.email
  // (module1-implementation-contract.md §7.2).
  findByGoogleSub(sub: string): Promise<AuthenticationMethod | null> {
    return this.prisma.client.authenticationMethod.findUnique({
      where: { provider_providerAccountId: { provider: 'GOOGLE', providerAccountId: sub } },
    });
  }

  findByUserAndProvider(
    userId: string,
    provider: 'EMAIL_PASSWORD' | 'GOOGLE',
  ): Promise<AuthenticationMethod | null> {
    return this.prisma.client.authenticationMethod.findUnique({
      where: { userId_provider: { userId, provider } },
    });
  }

  createGoogle(
    userId: string,
    sub: string,
    tx?: Prisma.TransactionClient,
  ): Promise<AuthenticationMethod> {
    return (tx ?? this.prisma.client).authenticationMethod.create({
      data: { userId, provider: 'GOOGLE', providerAccountId: sub },
    });
  }

  // Called from AuthService.register — keeps the ledger complete for every
  // new registrant, not just the ones the migration backfilled
  // (module1-implementation-contract.md §7.1: "a complete
  // authentication-method ledger from day one, not a Google-only
  // afterthought").
  createEmailPassword(
    userId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<AuthenticationMethod> {
    return (tx ?? this.prisma.client).authenticationMethod.create({
      data: { userId, provider: 'EMAIL_PASSWORD' },
    });
  }
}
