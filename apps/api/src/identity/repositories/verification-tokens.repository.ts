import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { VerificationToken } from '@marche/db';

@Injectable()
export class VerificationTokensRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: { userId: string; tokenHash: string; expiresAt: Date }): Promise<VerificationToken> {
    return this.prisma.client.verificationToken.create({ data });
  }

  findByTokenHash(tokenHash: string): Promise<VerificationToken | null> {
    return this.prisma.client.verificationToken.findUnique({ where: { tokenHash } });
  }

  deleteById(id: string): Promise<VerificationToken> {
    return this.prisma.client.verificationToken.delete({ where: { id } });
  }
}
