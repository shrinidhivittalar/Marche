import {
  JobsRepository,
  type JobSearchFilters,
  type JobSort,
} from '../repositories/jobs.repository';
import { publicJobWhere } from '../job-visibility';
import type { PrismaService } from '../../prisma/prisma.service';

// A structural view of the `where` clauses under test. Narrower than
// Prisma's generated types on purpose — it names exactly the conditions
// these tests care about, so a missing clause fails as a readable
// assertion rather than a type error.
type WhereLike = {
  id?: string;
  status?: string;
  deletedAt?: Date | null;
  categoryId?: { in: string[] };
  budgetMin?: { lte?: number };
  budgetMax?: { gte?: number };
  eventDate?: { gte?: Date; lte?: Date };
  locationCoarse?: { contains: string; mode: string };
  title?: { contains: string; mode: string };
  clientProfile?: {
    deletedAt?: Date | null;
    user?: { status?: string; deletedAt?: Date | null };
  };
  OR?: WhereLike[];
  AND?: WhereLike[];
};

// These assert the shape of the query the repository builds, which is where
// this module's worst bug would live: a public read path that forgets one
// clause of the visibility filter and leaks a draft or a cancelled
// requirement. Mocking Prisma checks every public method cheaply.
function build() {
  const job = {
    findMany: jest.fn().mockResolvedValue([]),
    findFirst: jest.fn().mockResolvedValue(null),
    findUnique: jest.fn().mockResolvedValue(null),
    count: jest.fn().mockResolvedValue(0),
    create: jest.fn(),
    update: jest.fn(),
    groupBy: jest.fn().mockResolvedValue([]),
  };
  const prisma = { client: { job } } as unknown as PrismaService;
  return { repository: new JobsRepository(prisma), job };
}

const filters = (over: Partial<JobSearchFilters> = {}): JobSearchFilters => ({ ...over });

// The visibility clause is nested inside an AND once any filter is applied,
// so tests reach for it rather than assuming a flat object.
function visibilityClauseOf(where: WhereLike): WhereLike {
  return where.AND ? where.AND[0] : where;
}

function filterClauseOf(where: WhereLike): WhereLike {
  return where.AND ? where.AND[1] : {};
}

describe('publicJobWhere', () => {
  it('restricts to published, undeleted requirements from live accounts', () => {
    const where = publicJobWhere() as WhereLike;

    expect(where.status).toBe('PUBLISHED');
    expect(where.deletedAt).toBeNull();
    expect(where.clientProfile?.deletedAt).toBeNull();
    expect(where.clientProfile?.user).toEqual({ status: 'ACTIVE', deletedAt: null });
  });

  it('composes extra conditions with AND so they cannot overwrite the visibility clause', () => {
    // A caller passing its own clientProfile filter must not be able to
    // replace the one above — that would silently disable the whole check.
    const where = publicJobWhere({ clientProfile: { id: 'profile_1' } }) as WhereLike;

    expect(where.AND).toHaveLength(2);
    expect(visibilityClauseOf(where).status).toBe('PUBLISHED');
  });

  it('returns a fresh object each call, so one caller cannot mutate another', () => {
    expect(publicJobWhere()).not.toBe(publicJobWhere());
  });
});

describe('JobsRepository', () => {
  describe('public reads', () => {
    it('applies the visibility filter when fetching one requirement', async () => {
      const { repository, job } = build();

      await repository.findPublicById('job_1');

      const where = job.findFirst.mock.calls[0][0].where as WhereLike;
      expect(visibilityClauseOf(where).status).toBe('PUBLISHED');
    });

    it('applies the visibility filter to search', async () => {
      const { repository, job } = build();

      await repository.search(filters(), 'newest', 0, 20);

      const where = job.findMany.mock.calls[0][0].where as WhereLike;
      expect(visibilityClauseOf(where).status).toBe('PUBLISHED');
    });

    it('applies the same visibility filter to the count', async () => {
      const { repository, job } = build();

      await repository.countSearch(filters());

      const where = job.count.mock.calls[0][0].where as WhereLike;
      expect(visibilityClauseOf(where).status).toBe('PUBLISHED');
    });
  });

  describe('location privacy', () => {
    // The structural guarantee the whole feature rests on: locationExact
    // must never be reachable through the shared select shape every public
    // and owner read is built from — only through findLocationExact, which
    // every real call site gates on an authorization check first (see
    // jobs.service.ts, proposals.service.ts, connections.service.ts).
    it('does not select locationExact when reading one requirement publicly', async () => {
      const { repository, job } = build();

      await repository.findPublicById('job_1');

      const select = job.findFirst.mock.calls[0][0].select as Record<string, unknown>;
      expect(select).not.toHaveProperty('locationExact');
      expect(select).toHaveProperty('locationCoarse', true);
    });

    it('does not select locationExact when searching', async () => {
      const { repository, job } = build();

      await repository.search(filters(), 'newest', 0, 20);

      const select = job.findMany.mock.calls[0][0].select as Record<string, unknown>;
      expect(select).not.toHaveProperty('locationExact');
    });

    it('does not select locationExact on the owner read', async () => {
      const { repository, job } = build();

      await repository.findByIdForOwner('job_1');

      const select = job.findFirst.mock.calls[0][0].select as Record<string, unknown>;
      expect(select).not.toHaveProperty('locationExact');
    });

    it('filters search by locationCoarse, not the old location column name', async () => {
      const { repository, job } = build();

      await repository.search(filters({ location: 'Bangalore' }), 'newest', 0, 20);

      const where = job.findMany.mock.calls[0][0].where as WhereLike;
      expect(filterClauseOf(where).locationCoarse).toEqual({
        contains: 'Bangalore',
        mode: 'insensitive',
      });
    });

    it('findLocationExact selects nothing but the one column, by id', async () => {
      const { repository, job } = build();
      job.findUnique.mockResolvedValue({ locationExact: { address: '221B Baker Street' } });

      const result = await repository.findLocationExact('job_1');

      expect(job.findUnique).toHaveBeenCalledWith({
        where: { id: 'job_1' },
        select: { locationExact: true },
      });
      expect(result).toEqual({ address: '221B Baker Street' });
    });

    it('findLocationExact returns null for a job with none set, not undefined', async () => {
      const { repository, job } = build();
      job.findUnique.mockResolvedValue({ locationExact: null });

      expect(await repository.findLocationExact('job_1')).toBeNull();
    });

    // update() and softDelete() previously had no select at all, returning
    // the complete row — locationExact included — to whatever called them.
    // Every real caller is owner-gated (JobsService.getOwnJob), so this was
    // never reachable by an unauthorized party, but it was still exactly
    // the "select everything" pattern the rest of this file avoids. Fixed
    // to select explicitly, same shape as findByIdForOwner.
    it('update() does not select locationExact', async () => {
      const { repository, job } = build();

      await repository.update('job_1', { title: 'Updated title' });

      const select = job.update.mock.calls[0][0].select as Record<string, unknown>;
      expect(select).not.toHaveProperty('locationExact');
      expect(select).toHaveProperty('locationCoarse', true);
    });

    it('softDelete() does not select locationExact', async () => {
      const { repository, job } = build();

      await repository.softDelete('job_1');

      const select = job.update.mock.calls[0][0].select as Record<string, unknown>;
      expect(select).not.toHaveProperty('locationExact');
    });
  });

  describe('countPostedByStatus', () => {
    it('excludes DRAFT from the query and zero-fills every status', async () => {
      const { repository, job } = build();
      job.groupBy.mockResolvedValue([
        { status: 'PUBLISHED', _count: 3 },
        { status: 'FILLED', _count: 2 },
      ]);

      const result = await repository.countPostedByStatus('client_1');

      const where = job.groupBy.mock.calls[0][0].where as WhereLike;
      expect(where.status).toEqual({ not: 'DRAFT' });
      expect(result).toEqual({ DRAFT: 0, PUBLISHED: 3, FILLED: 2, CANCELLED: 0 });
    });
  });

  describe('filters', () => {
    it('searches title and description for a keyword', async () => {
      const { repository, job } = build();

      await repository.search(filters({ q: 'wedding' }), 'newest', 0, 20);

      const clause = filterClauseOf(job.findMany.mock.calls[0][0].where as WhereLike);
      expect(clause.OR).toHaveLength(2);
      expect(clause.OR?.[0].title).toEqual({ contains: 'wedding', mode: 'insensitive' });
    });

    it('reads minBudget as "pays at least this", testing the top of the range', async () => {
      const { repository, job } = build();

      await repository.search(filters({ minBudget: 20000 }), 'newest', 0, 20);

      // Against budgetMax, not budgetMin: a requirement offering 10k–30k
      // does reach a provider's 20k floor, and testing budgetMin would
      // wrongly exclude it.
      const clause = filterClauseOf(job.findMany.mock.calls[0][0].where as WhereLike);
      expect(clause.budgetMax).toEqual({ gte: 20000 });
      expect(clause.budgetMin).toBeUndefined();
    });

    it('reads maxBudget as "starts no higher than this", testing the bottom', async () => {
      const { repository, job } = build();

      await repository.search(filters({ maxBudget: 50000 }), 'newest', 0, 20);

      const clause = filterClauseOf(job.findMany.mock.calls[0][0].where as WhereLike);
      expect(clause.budgetMin).toEqual({ lte: 50000 });
    });

    it('combines both event date bounds into one range', async () => {
      const { repository, job } = build();
      const from = new Date('2026-09-01');
      const until = new Date('2026-12-01');

      await repository.search(filters({ eventFrom: from, eventUntil: until }), 'newest', 0, 20);

      const clause = filterClauseOf(job.findMany.mock.calls[0][0].where as WhereLike);
      expect(clause.eventDate).toEqual({ gte: from, lte: until });
    });

    it('applies no filter clause at all when nothing is filtered', async () => {
      const { repository, job } = build();

      await repository.search(filters(), 'newest', 0, 20);

      // publicJobWhere returns its bare object rather than an AND of one,
      // so an unfiltered browse is the simplest possible query.
      const where = job.findMany.mock.calls[0][0].where as WhereLike;
      expect(where.AND).toBeUndefined();
    });
  });

  describe('sorting', () => {
    // Without a total order, Postgres may return two same-instant rows in a
    // different order per request, and a row can duplicate or vanish while
    // a provider pages through results.
    it.each<JobSort>(['newest', 'event_date', 'budget_low', 'budget_high'])(
      'breaks ties by id when sorting by %s',
      async (sort) => {
        const { repository, job } = build();

        await repository.search(filters(), sort, 0, 20);

        const orderBy = job.findMany.mock.calls[0][0].orderBy as Record<string, unknown>[];
        expect(orderBy[orderBy.length - 1]).toEqual({ id: 'asc' });
      },
    );

    it('sorts newest by publishedAt, not createdAt', async () => {
      const { repository, job } = build();

      await repository.search(filters(), 'newest', 0, 20);

      // "Newest" to a provider means newest to them — when it became
      // visible, not when the client started drafting it.
      expect(job.findMany.mock.calls[0][0].orderBy[0]).toEqual({ publishedAt: 'desc' });
    });

    it('puts requirements with no budget or date last, not first', async () => {
      const { repository, job } = build();

      await repository.search(filters(), 'budget_high', 0, 20);
      const byBudget = job.findMany.mock.calls[0][0].orderBy[0];
      expect(byBudget).toEqual({ budgetMax: { sort: 'desc', nulls: 'last' } });

      await repository.search(filters(), 'event_date', 0, 20);
      const byDate = job.findMany.mock.calls[1][0].orderBy[0];
      expect(byDate).toEqual({ eventDate: { sort: 'asc', nulls: 'last' } });
    });
  });

  describe('owner reads', () => {
    it('excludes soft-deleted requirements from the owner list', async () => {
      const { repository, job } = build();

      await repository.listByProfile('profile_1', 0, 20);

      expect(job.findMany.mock.calls[0][0].where).toEqual({
        clientProfileId: 'profile_1',
        deletedAt: null,
      });
    });

    it('orders the owner list newest-first with a total order', async () => {
      const { repository, job } = build();

      await repository.listByProfile('profile_1', 0, 20);

      expect(job.findMany.mock.calls[0][0].orderBy).toEqual([{ createdAt: 'desc' }, { id: 'asc' }]);
    });
  });

  describe('claimFilled', () => {
    // The transaction client, not the repository's own. Acceptance has three
    // more writes to make and all four must land together.
    function buildTx() {
      const job = { updateMany: jest.fn().mockResolvedValue({ count: 1 }) };
      return { tx: { job } as never, job };
    }

    it('carries the status test inside the update, not before it', async () => {
      const { repository } = build();
      const { tx, job } = buildTx();

      await repository.claimFilled(tx, 'job_1', ['PUBLISHED']);

      // The whole mechanism: two racing callers are serialised by Postgres
      // on this row, and the loser matches nothing. A findFirst followed by
      // an update would let both through.
      expect(job.updateMany.mock.calls[0][0]).toEqual({
        where: { id: 'job_1', status: { in: ['PUBLISHED'] }, deletedAt: null },
        data: { status: 'FILLED' },
      });
    });

    it('writes through the transaction client, never the repository client', async () => {
      const { repository, job: ownClient } = build();
      const { tx } = buildTx();

      await repository.claimFilled(tx, 'job_1', ['PUBLISHED']);

      expect(ownClient.update).not.toHaveBeenCalled();
    });

    it('reports zero rows claimed so the caller can conflict', async () => {
      const { repository } = build();
      const { tx, job } = buildTx();
      job.updateMany.mockResolvedValue({ count: 0 });

      await expect(repository.claimFilled(tx, 'job_1', ['PUBLISHED'])).resolves.toBe(0);
    });
  });
});
