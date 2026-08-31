import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { publicJobWhere } from '../job-visibility';
import type { Job, JobStatus, Prisma } from '@marche/db';

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
// a published one. Declared once so the two read paths cannot drift apart,
// and so adding a field means adding it in one place.
//
// The proposal count is counted, never stored — the schema comment above
// JobStatus says why: a PROPOSAL_ACTIVITY column would have to be flipped on
// every submission and unflipped on every withdrawal, and would be wrong the
// first time either was missed. Public rather than owner-only, unlike when
// this was first written: a provider deciding whether to bid benefits from
// knowing how much competition there already is, the same way Upwork shows
// a proposal range on every listing.
const JOB_FIELDS = {
  id: true,
  title: true,
  description: true,
  budgetMin: true,
  budgetMax: true,
  // Coarse only, deliberately — this constant backs every shared read path
  // (public, owner, and everything derived from it), and locationExact must
  // never be reachable through it. See findLocationExact below for the only
  // sanctioned way to read the exact value.
  locationCoarse: true,
  eventDate: true,
  eventStartTime: true,
  eventEndTime: true,
  proposalDeadline: true,
  deliverables: true,
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
  _count: { select: { proposals: true } },
} satisfies Prisma.JobSelect;

// What the owner sees on top of the shared fields.
const OWNER_JOB_FIELDS = {
  ...JOB_FIELDS,
  cancelledAt: true,
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
      select: { ...OWNER_JOB_FIELDS, updatedAt: true },
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
      select: OWNER_JOB_FIELDS,
    });
  }

  countByProfile(clientProfileId: string) {
    return this.prisma.client.job.count({ where: { clientProfileId, deletedAt: null } });
  }

  // For the public "About the client" stats — how many of this client's
  // requirements ever went live, broken down by where each one ended up.
  // DRAFT is excluded: a draft was never posted, so it says nothing about
  // this client's hiring behaviour.
  async countPostedByStatus(clientProfileId: string): Promise<Record<JobStatus, number>> {
    const rows = await this.prisma.client.job.groupBy({
      by: ['status'],
      where: { clientProfileId, deletedAt: null, status: { not: 'DRAFT' } },
      _count: true,
    });
    const counts = { DRAFT: 0, PUBLISHED: 0, FILLED: 0, CANCELLED: 0 } as Record<JobStatus, number>;
    for (const row of rows) {
      counts[row.status] = row._count;
    }
    return counts;
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

  // Explicit select, matching findByIdForOwner — an unselected `update`
  // returns the complete row, locationExact included, to whatever calls it.
  // Every caller today is already owner-gated (JobsService.getOwnJob), so
  // this was never reachable by an unauthorized party in practice — but it
  // is exactly the "select everything" shape the rest of this file
  // deliberately avoids, and a future caller that isn't owner-gated would
  // leak silently with no select boundary to catch it. Fixed here rather
  // than left as a latent risk.
  update(id: string, data: Prisma.JobUpdateInput) {
    return this.prisma.client.job.update({
      where: { id },
      data,
      select: { ...OWNER_JOB_FIELDS, updatedAt: true },
    });
  }

  softDelete(id: string) {
    return this.prisma.client.job.update({
      where: { id },
      data: { deletedAt: new Date() },
      select: { ...OWNER_JOB_FIELDS, updatedAt: true },
    });
  }

  /**
   * Claims a requirement as FILLED, but only if it is still in a status that
   * may become FILLED.
   *
   * `updateMany` rather than `update`, and that is the entire point: the
   * status test travels inside the UPDATE, so two callers racing to fill the
   * same requirement are serialised by Postgres on the row itself. The loser
   * matches zero rows — the status it required is no longer there — and is
   * told so, instead of overwriting the winner's claim. A findById-then-update
   * pair cannot do this: both reads see PUBLISHED before either write lands.
   *
   * Takes the transaction client, because the caller (accepting a proposal)
   * has three more writes to make and all four must land together.
   *
   * Returns the number of rows claimed: 1 for the winner, 0 for everyone else.
   */
  claimFilled(
    tx: Prisma.TransactionClient,
    jobId: string,
    claimableFrom: JobStatus[],
  ): Promise<number> {
    return tx.job
      .updateMany({
        where: { id: jobId, status: { in: claimableFrom }, deletedAt: null },
        data: { status: 'FILLED' },
      })
      .then((result) => result.count);
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

  /**
   * The provider profile hired on this requirement, or null if none is.
   *
   * Reads the Connection row rather than importing anything from Proposals:
   * the dependency runs Proposals -> Jobs and must not be reversed. What is
   * shared is the schema, not the module — Job has a `connection` relation,
   * jobId is unique on it, so "who was hired for this job" is a fact the Job
   * row can reach on its own.
   *
   * Only the id is selected: the caller is an access check, and everything
   * else on a connection belongs to the module that owns it.
   */
  findHiredProviderProfileId(jobId: string): Promise<string | null> {
    return this.prisma.client.connection
      .findUnique({ where: { jobId }, select: { providerProfileId: true } })
      .then((connection) => connection?.providerProfileId ?? null);
  }

  /**
   * The one and only place `locationExact` is ever selected.
   *
   * Deliberately its own tiny query rather than a field added to
   * JOB_FIELDS/OWNER_JOB_FIELDS: those constants back every shared read
   * path, and a private field living there would need every future caller
   * to remember to strip it rather than every caller that needs it
   * remembering to ask. Callers are exactly three (Jobs' own owner read,
   * Proposals' hired-provider read, Connections' both-parties read), and
   * each already independently proves the caller is the owner or the hired
   * provider before calling this — see jobs.service.ts, proposals.service.ts
   * and connections.service.ts.
   */
  findLocationExact(jobId: string): Promise<Prisma.JsonValue | null> {
    return this.prisma.client.job
      .findUnique({ where: { id: jobId }, select: { locationExact: true } })
      .then((job) => job?.locationExact ?? null);
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
      // Filters against locationCoarse only — the column rename, not a new
      // capability. Searching an exact address a provider was never shown
      // would be a filter that answers a question nobody could have asked.
      where.locationCoarse = { contains: filters.location, mode: 'insensitive' };
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
