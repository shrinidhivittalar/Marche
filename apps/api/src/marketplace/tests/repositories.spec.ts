import { Test } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { ServicesRepository, type ServiceSort } from '../repositories/services.repository';
import { CategoriesRepository } from '../repositories/categories.repository';
import { publicServiceWhere } from '../marketplace-visibility';

// A structural view of the `where` clauses under test. Narrower than
// Prisma's generated types on purpose — it names exactly the conditions
// these tests care about, so a missing clause fails as a readable
// assertion rather than a type error.
type WhereLike = {
  id?: string;
  status?: string;
  profileId?: string;
  deletedAt?: Date | null;
  categoryId?: { in: string[] };
  startingPrice?: { gte?: number; lte?: number };
  skills?: { some: { skillId: string } };
  tags?: { has: string };
  title?: { contains: string; mode: string };
  description?: { contains: string; mode: string };
  parentId?: string | null;
  profile?: {
    visibility?: string;
    deletedAt?: Date | null;
    location?: { contains: string; mode: string };
    availabilityStatus?: string;
    user?: { status?: string; deletedAt?: Date | null };
  };
  OR?: WhereLike[];
  AND?: WhereLike[];
};

// These assert the *shape of the query* the repositories build, which is
// where this module's worst bug would live: a public read path that forgets
// one clause of the visibility filter and leaks unpublished, deleted, or
// private listings. Mocking Prisma lets every public method be checked
// cheaply; the constraint behaviour itself was verified against the real
// database separately.
function mockPrisma() {
  const service = {
    findMany: jest.fn().mockResolvedValue([]),
    findFirst: jest.fn().mockResolvedValue(null),
    count: jest.fn().mockResolvedValue(0),
    groupBy: jest.fn().mockResolvedValue([]),
    create: jest.fn(),
    update: jest.fn(),
  };
  const category = {
    findMany: jest.fn().mockResolvedValue([]),
    findFirst: jest.fn().mockResolvedValue(null),
    findUnique: jest.fn().mockResolvedValue(null),
    count: jest.fn().mockResolvedValue(0),
    create: jest.fn(),
    update: jest.fn(),
  };
  const profile = { findMany: jest.fn().mockResolvedValue([]) };
  const skill = { count: jest.fn().mockResolvedValue(0) };
  const serviceSkill = {
    findMany: jest.fn().mockResolvedValue([]),
    create: jest.fn(),
    delete: jest.fn(),
  };
  return { client: { service, category, profile, skill, serviceSkill } };
}

type MockPrisma = ReturnType<typeof mockPrisma>;

// jest.Mock args are untyped, so read them back through the structural
// view above rather than sprinkling casts at each assertion.
const argsOf = (mock: jest.Mock): { where: WhereLike; [key: string]: unknown } =>
  mock.mock.calls[0][0];

describe('marketplace repositories', () => {
  let prisma: MockPrisma;
  let services: ServicesRepository;
  let categories: CategoriesRepository;

  beforeEach(async () => {
    prisma = mockPrisma();
    const moduleRef = await Test.createTestingModule({
      providers: [
        ServicesRepository,
        CategoriesRepository,
        { provide: PrismaService, useValue: prisma as unknown as PrismaService },
      ],
    }).compile();
    services = moduleRef.get(ServicesRepository);
    categories = moduleRef.get(CategoriesRepository);
  });

  describe('publicServiceWhere', () => {
    it('requires published, undeleted, public, active-owner', () => {
      const where = publicServiceWhere() as WhereLike;
      expect(where.status).toBe('PUBLISHED');
      expect(where.deletedAt).toBeNull();
      expect(where.profile?.visibility).toBe('PUBLIC');
      expect(where.profile?.deletedAt).toBeNull();
      expect(where.profile?.user?.status).toBe('ACTIVE');
      expect(where.profile?.user?.deletedAt).toBeNull();
    });

    it('returns a fresh object each call so callers cannot mutate it', () => {
      const a = publicServiceWhere() as WhereLike;
      a.status = 'DRAFT';
      expect((publicServiceWhere() as WhereLike).status).toBe('PUBLISHED');
    });

    it('AND-composes extras so a caller cannot overwrite the profile clause', () => {
      const where = publicServiceWhere({ profile: { visibility: 'PRIVATE' } }) as WhereLike;
      expect(where.AND).toHaveLength(2);
      expect(where.AND?.[0].profile?.visibility).toBe('PUBLIC');
    });
  });

  describe('every public read applies the visibility filter', () => {
    const assertVisibility = (where: WhereLike) => {
      const base = where.AND ? where.AND[0] : where;
      expect(base.status).toBe('PUBLISHED');
      expect(base.deletedAt).toBeNull();
      expect(base.profile?.visibility).toBe('PUBLIC');
      expect(base.profile?.user?.status).toBe('ACTIVE');
    };

    it('findPublicById', async () => {
      await services.findPublicById('svc_1');
      assertVisibility(argsOf(prisma.client.service.findFirst).where);
    });

    it('search', async () => {
      await services.search({}, 'newest', 0, 20);
      assertVisibility(argsOf(prisma.client.service.findMany).where);
    });

    it('countSearch', async () => {
      await services.countSearch({});
      assertVisibility(argsOf(prisma.client.service.count).where);
    });

    it('searchProviders', async () => {
      await services.searchProviders({}, 'newest', 0, 20);
      assertVisibility(argsOf(prisma.client.service.groupBy).where);
    });

    it('countSearchProviders', async () => {
      await services.countSearchProviders({});
      assertVisibility(argsOf(prisma.client.service.groupBy).where);
    });
  });

  describe('owner reads are scoped to the owner and exclude deleted', () => {
    it('listByProfile filters by profileId', async () => {
      await services.listByProfile('profile_1', 0, 20);
      const where = argsOf(prisma.client.service.findMany).where;
      expect(where).toEqual({ profileId: 'profile_1', deletedAt: null });
    });

    it('findById excludes soft-deleted', async () => {
      await services.findById('svc_1');
      expect(argsOf(prisma.client.service.findFirst).where.deletedAt).toBeNull();
    });
  });

  describe('sorting', () => {
    it.each([
      ['newest', 'createdAt'],
      ['price_low', 'startingPrice'],
      ['price_high', 'startingPrice'],
    ])('%s ends with an id tiebreaker', async (sort, primary) => {
      await services.search({}, sort as ServiceSort, 0, 20);
      const orderBy = argsOf(prisma.client.service.findMany).orderBy as Record<string, string>[];
      expect(Object.keys(orderBy[0])[0]).toBe(primary);
      expect(orderBy[orderBy.length - 1]).toEqual({ id: 'asc' });
    });
  });

  describe('filters', () => {
    const whereOf = (mock: jest.Mock): WhereLike[] => argsOf(mock).where.AND![1].AND!;

    it('q searches title, description and tags', async () => {
      await services.search({ q: 'Balloon' }, 'newest', 0, 20);
      const or = whereOf(prisma.client.service.findMany)[0].OR!;
      expect(or[0].title?.contains).toBe('Balloon');
      expect(or[0].title?.mode).toBe('insensitive');
      expect(or[1].description?.contains).toBe('Balloon');
      // Tags are normalised to lowercase on write, so the tag arm lowercases
      // the query to stay case-insensitive.
      expect(or[2].tags?.has).toBe('balloon');
    });

    it('multiple skills AND together rather than OR', async () => {
      await services.search({ skillIds: ['s1', 's2'] }, 'newest', 0, 20);
      const and = whereOf(prisma.client.service.findMany);
      expect(and).toContainEqual({ skills: { some: { skillId: 's1' } } });
      expect(and).toContainEqual({ skills: { some: { skillId: 's2' } } });
    });

    it('category filter accepts a rolled-up id list', async () => {
      await services.search({ categoryIds: ['parent', 'child'] }, 'newest', 0, 20);
      expect(whereOf(prisma.client.service.findMany)).toContainEqual({
        categoryId: { in: ['parent', 'child'] },
      });
    });

    it('price bounds are inclusive', async () => {
      await services.search({ minPrice: 100, maxPrice: 500 }, 'newest', 0, 20);
      const and = whereOf(prisma.client.service.findMany);
      expect(and).toContainEqual({ startingPrice: { gte: 100 } });
      expect(and).toContainEqual({ startingPrice: { lte: 500 } });
    });

    it('location and availability filter through the profile, not the service', async () => {
      await services.search({ location: 'Mumbai', availability: 'AVAILABLE' }, 'newest', 0, 20);
      const and = whereOf(prisma.client.service.findMany);
      expect(and).toContainEqual({
        profile: { location: { contains: 'Mumbai', mode: 'insensitive' } },
      });
      expect(and).toContainEqual({ profile: { availabilityStatus: 'AVAILABLE' } });
    });

    it('a price of zero is a real filter, not treated as absent', async () => {
      await services.search({ minPrice: 0 }, 'newest', 0, 20);
      expect(whereOf(prisma.client.service.findMany)).toContainEqual({
        startingPrice: { gte: 0 },
      });
    });
  });

  describe('provider discovery', () => {
    it('groups by provider and carries the cheapest matching price', async () => {
      await services.searchProviders({}, 'price_low', 0, 20);
      const args = argsOf(prisma.client.service.groupBy);
      expect(args.by).toEqual(['profileId']);
      expect(args._min).toEqual({ startingPrice: true });
    });

    it('counts distinct providers, not matching services', async () => {
      prisma.client.service.groupBy.mockResolvedValue([{ profileId: 'p1' }, { profileId: 'p2' }]);
      await expect(services.countSearchProviders({})).resolves.toBe(2);
      // No skip/take on the counting query — it must see every group.
      const args = argsOf(prisma.client.service.groupBy);
      expect(args.skip).toBeUndefined();
      expect(args.take).toBeUndefined();
    });

    it('paginates the grouped rows, not the service rows', async () => {
      await services.searchProviders({}, 'newest', 40, 20);
      const args = argsOf(prisma.client.service.groupBy);
      expect(args.skip).toBe(40);
      expect(args.take).toBe(20);
    });
  });

  describe('categories', () => {
    it('tree excludes soft-deleted parents and children', async () => {
      await categories.findTree();
      const args = argsOf(prisma.client.category.findMany);
      expect(args.where).toEqual({ parentId: null, deletedAt: null });
      expect((args.include as Record<string, { where: unknown }>).children.where).toEqual({
        deletedAt: null,
      });
    });

    it('rolls a parent up with its children for filtering', async () => {
      prisma.client.category.findMany.mockResolvedValue([{ id: 'c1' }, { id: 'c2' }]);
      await expect(categories.findSelfAndChildIds('parent')).resolves.toEqual([
        'parent',
        'c1',
        'c2',
      ]);
    });

    it('delete is soft', async () => {
      await categories.softDelete('cat_1');
      const data = argsOf(prisma.client.category.update).data as { deletedAt: unknown };
      expect(data.deletedAt).toBeInstanceOf(Date);
    });

    it('blocking counts ignore already-deleted rows', async () => {
      await categories.countChildren('cat_1');
      expect(argsOf(prisma.client.category.count).where.deletedAt).toBeNull();
      await categories.countServices('cat_1');
      expect(argsOf(prisma.client.service.count).where.deletedAt).toBeNull();
    });
  });
});
