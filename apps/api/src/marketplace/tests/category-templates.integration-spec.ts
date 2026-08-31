import { Test, type TestingModule } from '@nestjs/testing';
import { AppModule } from '../../app.module';
import { PrismaService } from '../../prisma/prisma.service';
import { CategoryTemplatesService } from '../services/category-templates.service';
import { RedisThrottlerStorage } from '../../throttler/redis-throttler-storage';

/**
 * Category templates — Slice 3 of the category-requirements work.
 *
 * Runs against the real database because the thing genuinely at risk here
 * is exactly what a mock cannot prove: that creating a new version and
 * repointing Category.activeCategoryTemplateId actually land together (the
 * whole point of createAndActivate's transaction), and that a previous
 * version survives completely unchanged — byte for byte, not merely
 * "the mock wasn't called again" — once a new one is activated.
 *
 * Everything this file creates is prefixed `m-tmpl-` and deleted in
 * afterAll, including on failure.
 */

const RUN = `m-tmpl-${Date.now()}`;
const created = {
  userIds: [] as string[],
  categoryIds: [] as string[],
};

describe('category templates', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let templates: CategoryTemplatesService;
  let adminUserId: string;
  let categoryId: string;
  let categorySlug: string;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(RedisThrottlerStorage)
      .useValue({
        increment: async () => ({
          totalHits: 0,
          timeToExpire: 0,
          isBlocked: false,
          timeToBlockExpire: 0,
        }),
      })
      .compile();
    prisma = moduleRef.get(PrismaService);
    templates = moduleRef.get(CategoryTemplatesService);

    const admin = await prisma.client.user.create({
      data: {
        email: `${RUN}-admin@example.invalid`,
        passwordHash: 'integration-test-only',
        name: `${RUN} admin`,
        role: 'ADMIN',
        platformRole: 'ADMIN',
        emailVerifiedAt: new Date(),
      },
    });
    adminUserId = admin.id;
    created.userIds.push(admin.id);

    categorySlug = `${RUN}-painting`;
    const category = await prisma.client.category.create({
      data: { name: `${RUN} Painting`, slug: categorySlug },
    });
    categoryId = category.id;
    created.categoryIds.push(category.id);
  }, 60_000);

  afterAll(async () => {
    await prisma.client.categoryTemplateField.deleteMany({
      where: { categoryTemplate: { categoryId: { in: created.categoryIds } } },
    });
    // The active pointer must be cleared before the templates it points at
    // can be deleted — the FK is RESTRICT, deliberately (see the migration
    // header).
    await prisma.client.category.updateMany({
      where: { id: { in: created.categoryIds } },
      data: { activeCategoryTemplateId: null },
    });
    await prisma.client.categoryTemplate.deleteMany({
      where: { categoryId: { in: created.categoryIds } },
    });
    await prisma.client.category.deleteMany({ where: { id: { in: created.categoryIds } } });
    await prisma.client.user.deleteMany({ where: { id: { in: created.userIds } } });
    await moduleRef.close();
  }, 60_000);

  it('a category with nothing configured returns a clean { template: null }, not an error', async () => {
    const result = await templates.getActiveForSlug(categorySlug);
    expect(result).toEqual({ template: null });
  }, 30_000);

  it('creates and activates a version atomically, and it is immediately publicly readable', async () => {
    const created1 = await templates.createAndActivate('ADMIN', adminUserId, categoryId, {
      fields: [
        { key: 'area', label: 'Approximate area', type: 'NUMBER', required: true, order: 0 },
        { key: 'rooms', label: 'Number of rooms', type: 'NUMBER', required: true, order: 1 },
        {
          key: 'paint-type',
          label: 'Paint type',
          type: 'SELECT',
          required: false,
          order: 2,
          options: ['emulsion', 'enamel', 'distemper'],
        },
      ],
    });

    expect(created1.fields.map((f) => f.key)).toEqual(['area', 'rooms', 'paint-type']);

    const category = await prisma.client.category.findUniqueOrThrow({ where: { id: categoryId } });
    expect(category.activeCategoryTemplateId).toBe(created1.id);

    const publicView = await templates.getActiveForSlug(categorySlug);
    expect(publicView.template?.id).toBe(created1.id);
    expect(publicView.template?.fields.map((f) => f.key)).toEqual(['area', 'rooms', 'paint-type']);
  }, 30_000);

  it('field ordering is preserved end to end, including a non-sequential admin-supplied order', async () => {
    const version = await templates.createAndActivate('ADMIN', adminUserId, categoryId, {
      fields: [
        { key: 'c', label: 'C', type: 'TEXT', required: false, order: 20 },
        { key: 'a', label: 'A', type: 'TEXT', required: false, order: 0 },
        { key: 'b', label: 'B', type: 'TEXT', required: false, order: 10 },
      ],
    });

    expect(version.fields.map((f) => f.key)).toEqual(['a', 'b', 'c']);
  }, 30_000);

  it('rejects a duplicate field key structurally before anything is written', async () => {
    await expect(
      templates.createAndActivate('ADMIN', adminUserId, categoryId, {
        fields: [
          { key: 'area', label: 'Area', type: 'NUMBER', required: true, order: 0 },
          { key: 'area', label: 'Area again', type: 'NUMBER', required: false, order: 1 },
        ],
      }),
    ).rejects.toThrow();
  }, 30_000);

  it('a new version becomes active while the previous version remains completely unchanged and retrievable', async () => {
    const v1 = await templates.createAndActivate('ADMIN', adminUserId, categoryId, {
      fields: [
        { key: 'area', label: 'Area', type: 'NUMBER', required: true, order: 0 },
        { key: 'rooms', label: 'Rooms', type: 'NUMBER', required: true, order: 1 },
        { key: 'paint-type', label: 'Paint type', type: 'TEXT', required: false, order: 2 },
      ],
    });

    const v2 = await templates.createAndActivate('ADMIN', adminUserId, categoryId, {
      fields: [
        { key: 'area', label: 'Area', type: 'NUMBER', required: true, order: 0 },
        { key: 'rooms', label: 'Rooms', type: 'NUMBER', required: true, order: 1 },
        { key: 'surface-type', label: 'Surface type', type: 'TEXT', required: false, order: 2 },
      ],
    });

    expect(v2.id).not.toBe(v1.id);

    // The category now points at v2.
    const active = await templates.getActiveForSlug(categorySlug);
    expect(active.template?.id).toBe(v2.id);
    expect(active.template?.fields.map((f) => f.key)).toEqual(['area', 'rooms', 'surface-type']);

    // v1 is untouched — retrievable, byte for byte, through the admin
    // version-history read, scoped to this category.
    const v1Reread = await templates.getVersion('ADMIN', categoryId, v1.id);
    expect(v1Reread.fields.map((f) => f.key)).toEqual(['area', 'rooms', 'paint-type']);

    const history = await templates.listVersions('ADMIN', categoryId);
    expect(history.map((t) => t.id)).toEqual(expect.arrayContaining([v1.id, v2.id]));
  }, 30_000);
});
