import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { Job, Prisma } from '@marche/db';

// What a client sees on their own requirement, and what a provider sees on
// a published one. Identical for now: nothing on a Job is owner-only.
// Declared once so the two read paths cannot drift apart, and so adding a
// field means adding it in one place.
const JOB_FIELDS = {
  id: true,
  title: true,
  description: true,
  budgetMin: true,
  budgetMax: true,
  location: true,
  eventDate: true,
  status: true,
  publishedAt: true,
  createdAt: true,
  category: { select: { id: true, name: true, slug: true } },
  clientProfile: {
    select: {
      id: true,
      username: true,
      displayName: true,
      location: true,
      verifiedAt: true,
    },
  },
} satisfies Prisma.JobSelect;

@Injectable()
export class JobsRepository {
  constructor(private readonly prisma: PrismaService) {}

  // Returns the bare row rather than JOB_FIELDS: callers are the ownership
  // and lifecycle checks, which need clientProfileId and status, not the
  // client's display name.
  findById(id: string) {
    return this.prisma.client.job.findFirst({ where: { id, deletedAt: null } });
  }

  findByIdForOwner(id: string) {
    return this.prisma.client.job.findFirst({
      where: { id, deletedAt: null },
      select: { ...JOB_FIELDS, cancelledAt: true, updatedAt: true },
    });
  }

  listByProfile(clientProfileId: string, skip: number, take: number) {
    return this.prisma.client.job.findMany({
      where: { clientProfileId, deletedAt: null },
      // Newest first, with id as a tiebreaker so the order is total —
      // without it Postgres may return two same-instant rows in a different
      // order per request, and a row can duplicate or vanish across pages.
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      skip,
      take,
      select: { ...JOB_FIELDS, cancelledAt: true },
    });
  }

  countByProfile(clientProfileId: string) {
    return this.prisma.client.job.count({ where: { clientProfileId, deletedAt: null } });
  }

  create(data: Prisma.JobUncheckedCreateInput): Promise<Job> {
    return this.prisma.client.job.create({ data });
  }

  update(id: string, data: Prisma.JobUpdateInput): Promise<Job> {
    return this.prisma.client.job.update({ where: { id }, data });
  }

  softDelete(id: string): Promise<Job> {
    return this.prisma.client.job.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
