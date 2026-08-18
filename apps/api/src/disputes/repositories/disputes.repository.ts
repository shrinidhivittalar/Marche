import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { Dispute, DisputeStatus, Prisma } from '@marche/db';

@Injectable()
export class DisputesRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(
    connectionId: string,
    raisedByUserId: string,
    raisedAgainstUserId: string,
    reason: string,
    evidence: string,
  ): Promise<Dispute> {
    return this.prisma.client.dispute.create({
      data: { connectionId, raisedByUserId, raisedAgainstUserId, reason, evidence },
    });
  }

  findById(id: string): Promise<Dispute | null> {
    return this.prisma.client.dispute.findUnique({ where: { id } });
  }

  // Only one non-resolved dispute may be active on a connection at a time —
  // enforced here (check-then-write) rather than a DB constraint: Postgres
  // has no "unique per connectionId WHERE status != RESOLVED" without a
  // raw-SQL partial index, and this doesn't carry the correctness stakes
  // Reviews' or SavedProvider's unique constraints do — two open disputes
  // existing briefly is an admin inconvenience, not a data-integrity bug.
  findActiveForConnection(connectionId: string): Promise<Dispute | null> {
    return this.prisma.client.dispute.findFirst({
      where: { connectionId, status: { not: 'RESOLVED' } },
    });
  }

  listForConnection(connectionId: string): Promise<Dispute[]> {
    return this.prisma.client.dispute.findMany({
      where: { connectionId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
  }

  resolve(id: string, resolvedByUserId: string, resolution: string): Promise<Dispute> {
    return this.prisma.client.dispute.update({
      where: { id },
      data: { status: 'RESOLVED', resolvedAt: new Date(), resolvedByUserId, resolution },
    });
  }

  // ---------- admin queue ----------

  listAll(status: DisputeStatus | undefined, skip: number, take: number): Promise<Dispute[]> {
    return this.prisma.client.dispute.findMany({
      where: this.adminFilter(status),
      // Oldest first — the admin queue is worked off like a backlog, not
      // browsed newest-first like every other list in this codebase.
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      skip,
      take,
    });
  }

  countAll(status: DisputeStatus | undefined): Promise<number> {
    return this.prisma.client.dispute.count({ where: this.adminFilter(status) });
  }

  private adminFilter(status: DisputeStatus | undefined): Prisma.DisputeWhereInput {
    return status ? { status } : {};
  }
}
