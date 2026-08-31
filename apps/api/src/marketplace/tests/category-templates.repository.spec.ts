import { CategoryTemplatesRepository } from '../repositories/category-templates.repository';
import type { PrismaService } from '../../prisma/prisma.service';

function build() {
  const categoryTemplate = {
    findUnique: jest.fn().mockResolvedValue(null),
    findFirst: jest.fn().mockResolvedValue(null),
    findMany: jest.fn().mockResolvedValue([]),
    create: jest.fn(),
  };
  const category = {
    findFirst: jest.fn().mockResolvedValue(null),
    update: jest.fn(),
  };
  const tx = {
    categoryTemplate: { create: jest.fn().mockResolvedValue({ id: 'template_2' }) },
    category: { update: jest.fn().mockResolvedValue({ id: 'category_1' }) },
  };
  const prisma = {
    client: {
      categoryTemplate,
      category,
      $transaction: jest.fn().mockImplementation((fn: (tx: unknown) => unknown) => fn(tx)),
    },
  } as unknown as PrismaService;

  return { repository: new CategoryTemplatesRepository(prisma), categoryTemplate, category, tx };
}

describe('CategoryTemplatesRepository', () => {
  describe('findActiveForCategory / findActiveForCategoryBySlug', () => {
    it('resolves through the category, not a separate lookup by "most recent"', async () => {
      const { repository, category } = build();
      category.findFirst.mockResolvedValue({
        activeCategoryTemplate: { id: 'template_1', fields: [] },
      });

      const result = await repository.findActiveForCategory('category_1');

      expect(category.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'category_1', deletedAt: null },
        }),
      );
      expect(result).toEqual({ id: 'template_1', fields: [] });
    });

    it('returns null, not undefined, for a category with nothing configured', async () => {
      const { repository, category } = build();
      category.findFirst.mockResolvedValue({ activeCategoryTemplate: null });

      expect(await repository.findActiveForCategory('category_1')).toBeNull();
    });

    it('excludes soft-deleted categories', async () => {
      const { repository, category } = build();

      await repository.findActiveForCategoryBySlug('painting');

      expect(category.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { slug: 'painting', deletedAt: null } }),
      );
    });
  });

  describe('listByCategory', () => {
    it('orders newest first, with id as a tiebreaker', async () => {
      const { repository, categoryTemplate } = build();

      await repository.listByCategory('category_1');

      expect(categoryTemplate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { categoryId: 'category_1' },
          orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        }),
      );
    });
  });

  describe('findById', () => {
    it('orders fields by their declared order, with id as a tiebreaker', async () => {
      const { repository, categoryTemplate } = build();

      await repository.findById('template_1');

      const call = categoryTemplate.findUnique.mock.calls[0][0];
      expect(call.select.fields.orderBy).toEqual([{ order: 'asc' }, { id: 'asc' }]);
    });
  });

  describe('findByIdForCategory', () => {
    it('scopes by categoryId at the query level, not just the template id', async () => {
      const { repository, categoryTemplate } = build();

      await repository.findByIdForCategory('category_1', 'template_1');

      expect(categoryTemplate.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'template_1', categoryId: 'category_1' } }),
      );
    });
  });

  describe('createAndActivate', () => {
    it('creates the template and repoints the category inside one transaction', async () => {
      const { repository, tx, categoryTemplate } = build();
      categoryTemplate.findUnique.mockResolvedValue({ id: 'template_2', fields: [] });

      await repository.createAndActivate('category_1', 'user_1', [
        { key: 'area', label: 'Area', type: 'NUMBER', required: true, order: 0 },
      ]);

      expect(tx.categoryTemplate.create).toHaveBeenCalledWith({
        data: {
          categoryId: 'category_1',
          createdByUserId: 'user_1',
          fields: {
            create: [{ key: 'area', label: 'Area', type: 'NUMBER', required: true, order: 0 }],
          },
        },
      });
      expect(tx.category.update).toHaveBeenCalledWith({
        where: { id: 'category_1' },
        data: { activeCategoryTemplateId: 'template_2' },
      });
    });

    it('re-reads through the same shaped select every other read uses', async () => {
      const { repository, categoryTemplate } = build();
      categoryTemplate.findUnique.mockResolvedValue({ id: 'template_2', fields: [] });

      const result = await repository.createAndActivate('category_1', 'user_1', []);

      expect(categoryTemplate.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'template_2' } }),
      );
      expect(result).toEqual({ id: 'template_2', fields: [] });
    });

    it('writes both the template and the category pointer through the transaction client, never the repository client', async () => {
      const { repository, tx, categoryTemplate, category } = build();
      categoryTemplate.findUnique.mockResolvedValue({ id: 'template_2', fields: [] });

      await repository.createAndActivate('category_1', 'user_1', []);

      expect(tx.categoryTemplate.create).toHaveBeenCalled();
      expect(tx.category.update).toHaveBeenCalled();
      expect(categoryTemplate.create).not.toHaveBeenCalled();
      expect(category.update).not.toHaveBeenCalled();
    });
  });
});
