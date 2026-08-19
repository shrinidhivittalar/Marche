import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { Session } from '@marche/db';

@Injectable()
export class SessionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: {
    userId: string;
    refreshTokenHash: string;
    userAgent?: string;
    ipAddress?: string;
    expiresAt: Date;
  }): Promise<Session> {
    return this.prisma.client.session.create({ data });
  }

  findActiveByRefreshTokenHash(refreshTokenHash: string): Promise<Session | null> {
    return this.prisma.client.session.findFirst({
      where: { refreshTokenHash, revokedAt: null, expiresAt: { gt: new Date() } },
    });
  }

  // Unlike findActiveByRefreshTokenHash, this ignores revokedAt/expiresAt —
  // it exists so refresh() can tell "this hash was never issued" apart from
  // "this hash was issued and already rotated away", which is the reuse
  // signal.
  findByRefreshTokenHash(refreshTokenHash: string): Promise<Session | null> {
    return this.prisma.client.session.findUnique({ where: { refreshTokenHash } });
  }

  revoke(sessionId: string): Promise<Session> {
    return this.prisma.client.session.update({
      where: { id: sessionId },
      data: { revokedAt: new Date() },
    });
  }

  revokeAllForUser(userId: string): Promise<{ count: number }> {
    return this.prisma.client.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
