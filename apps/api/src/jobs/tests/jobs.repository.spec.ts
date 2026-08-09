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
  location?: { contains: string; mode: string };
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
    count: jest.fn().mockResolvedValue(0),
    create: jest.fn(),
    update: jest.fn(),
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
});
