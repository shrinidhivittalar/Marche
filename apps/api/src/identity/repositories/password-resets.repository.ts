import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { PasswordReset } from '@marche/db';

@Injectable()
export class PasswordResetsRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: { userId: string; tokenHash: string; expiresAt: Date }): Promise<PasswordReset> {
    return this.prisma.client.passwordReset.create({ data });
  }

  findByTokenHash(tokenHash: string): Promise<PasswordReset | null> {
    return this.prisma.client.passwordReset.findUnique({ where: { tokenHash } });
  }

  markUsed(id: string): Promise<PasswordReset> {
    return this.prisma.client.passwordReset.update({
      where: { id },
      data: { usedAt: new Date() },
    });
  }
}
