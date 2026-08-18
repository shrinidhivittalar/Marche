import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { Referral } from '@marche/db';

@Injectable()
export class ReferralsRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: {
    referrerProfileId: string;
    name: string;
    email: string;
    specialty: string;
    note: string | null;
  }): Promise<Referral> {
    return this.prisma.client.referral.create({ data });
  }

  find(referrerProfileId: string, email: string) {
    return this.prisma.client.referral.findUnique({
      where: { referrerProfileId_email: { referrerProfileId, email } },
    });
  }

  // Newest first, with id as a tiebreaker — same rule as every other list
  // in this codebase.
  listByReferrer(referrerProfileId: string, skip: number, take: number) {
    return this.prisma.client.referral.findMany({
      where: { referrerProfileId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip,
      take,
    });
  }

  countByReferrer(referrerProfileId: string): Promise<number> {
    return this.prisma.client.referral.count({ where: { referrerProfileId } });
  }

  // Called from AuthService.register. Every still-INVITED referral for this
  // email joins at once — different clients may have invited the same
  // address, and all of them referred correctly.
  markJoined(email: string): Promise<number> {
    return this.prisma.client.referral
      .updateMany({
        where: { email, status: 'INVITED' },
        data: { status: 'JOINED', joinedAt: new Date() },
      })
      .then((result) => result.count);
  }
}
