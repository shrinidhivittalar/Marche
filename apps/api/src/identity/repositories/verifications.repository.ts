import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { Prisma, Verification } from '@marche/db';

@Injectable()
export class VerificationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  // The write-side counterpart to UsersRepository.markEmailVerified —
  // module1-implementation-contract.md §8.2 requires both to happen in the
  // same transaction. Upsert on (userId, type) rather than a plain create:
  // this must be a safe no-op if it is ever called twice for the same user
  // (there is no re-verification flow yet, but the unique constraint is the
  // idempotency key either way, same pattern as UserCapability).
  upsertEmailVerified(
    userId: string,
    verifiedAt: Date,
    tx?: Prisma.TransactionClient,
  ): Promise<Verification> {
    return (tx ?? this.prisma.client).verification.upsert({
      where: { userId_type: { userId, type: 'EMAIL' } },
      create: { userId, type: 'EMAIL', status: 'VERIFIED', verifiedAt },
      update: { status: 'VERIFIED', verifiedAt },
    });
  }
}
