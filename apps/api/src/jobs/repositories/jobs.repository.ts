import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { publicJobWhere } from '../job-visibility';
import type { Job, Prisma } from '@marche/db';

export type JobSort = 'newest' | 'event_date' | 'budget_low' | 'budget_high';

export interface JobSearchFilters {
  q?: string;
  categoryIds?: string[];
  location?: string;
  minBudget?: number;
  maxBudget?: number;
  eventFrom?: Date;
  eventUntil?: Date;
}

// Every sort ends with `id` so the order is total. Without it Postgres may
// return rows in a different order for the same page across requests, and
// items can duplicate or vanish while a provider pages through results.
//
// nulls: 'last' on every optional column: a requirement with no budget or
// no date should sit at the end of a list sorted by that column, not float
// to the top of it.
const SORT_ORDER: Record<JobSort, Prisma.JobOrderByWithRelationInput[]> = {
  // publishedAt, not createdAt: "newest" means newest to a provider, which
  // is when it became visible, not when the client started drafting it.
  newest: [{ publishedAt: 'desc' }, { id: 'asc' }],
  event_date: [{ eventDate: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }],
  budget_low: [{ budgetMin: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }],
  budget_high: [{ budgetMax: { sort: 'desc', nulls: 'last' } }, { id: 'asc' }],
};

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

  // ---------- public reads (visibility filter always applied) ----------

  findPublicById(id: string) {
    return this.prisma.client.job.findFirst({
      where: publicJobWhere({ id }),
      select: JOB_FIELDS,
    });
  }

  search(filters: JobSearchFilters, sort: JobSort, skip: number, take: number) {
    return this.prisma.client.job.findMany({
      where: publicJobWhere(this.buildFilters(filters)),
      orderBy: SORT_ORDER[sort],
      skip,
      take,
      select: JOB_FIELDS,
    });
  }

  countSearch(filters: JobSearchFilters) {
    return this.prisma.client.job.count({
      where: publicJobWhere(this.buildFilters(filters)),
    });
  }

  // ---------- writes ----------

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

  // ---------- attachments ----------

  listAttachments(jobId: string) {
    return this.prisma.client.jobAttachment.findMany({
      where: { jobId },
      orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        displayOrder: true,
        mediaId: true,
        media: {
          select: { objectKey: true, status: true, originalFileName: true, mimeType: true },
        },
      },
    });
  }

  addAttachment(jobId: string, mediaId: string, displayOrder: number) {
    return this.prisma.client.jobAttachment.create({
      data: { jobId, mediaId, displayOrder },
    });
  }

  removeAttachment(jobId: string, attachmentId: string) {
    // Scoped by jobId as well as attachmentId: checking the attachment id
    // alone would let any client detach any other requirement's file.
    return this.prisma.client.jobAttachment.deleteMany({ where: { id: attachmentId, jobId } });
  }

  countAttachments(jobId: string) {
    return this.prisma.client.jobAttachment.count({ where: { jobId } });
  }

  // ---------- filter construction ----------

  /**
   * Turns the resolved filters into a Prisma `where`.
   *
   * Private and used only by search/countSearch, so a filter can never be
   * applied to one and forgotten on the other — which would give a page of
   * results with a total that disagrees with it.
   *
   * Returns undefined rather than {} when nothing is filtered, so an
   * unfiltered browse is a plain visibility query instead of an AND with an
   * empty clause hanging off it.
   */
  private buildFilters(filters: JobSearchFilters): Prisma.JobWhereInput | undefined {
    const where: Prisma.JobWhereInput = {};

    if (filters.q) {
      // Title and description only. Unlike Service there are no tags to
      // search: a requirement is written once by one client, so free-text
      // keywords have nowhere else to live.
      where.OR = [
        { title: { contains: filters.q, mode: 'insensitive' } },
        { description: { contains: filters.q, mode: 'insensitive' } },
      ];
    }

    if (filters.categoryIds?.length) {
      where.categoryId = { in: filters.categoryIds };
    }

    if (filters.location) {
      where.location = { contains: filters.location, mode: 'insensitive' };
    }

    // Read from the provider's side: minBudget is "pays at least this", so
    // it tests the top of the client's range; maxBudget is "starts no
    // higher than this", so it tests the bottom. A requirement with no
    // budget has null on both sides and drops out of either filter, which
    // is the intended behaviour — see the DTO.
    if (filters.minBudget !== undefined) {
      where.budgetMax = { gte: filters.minBudget };
    }
    if (filters.maxBudget !== undefined) {
      where.budgetMin = { lte: filters.maxBudget };
    }

    if (filters.eventFrom || filters.eventUntil) {
      where.eventDate = {
        ...(filters.eventFrom ? { gte: filters.eventFrom } : {}),
        ...(filters.eventUntil ? { lte: filters.eventUntil } : {}),
      };
    }

    return Object.keys(where).length > 0 ? where : undefined;
  }
}
