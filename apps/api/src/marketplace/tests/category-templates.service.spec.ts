import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { CategoryTemplatesService } from '../services/category-templates.service';
import type { CategoryTemplatesRepository } from '../repositories/category-templates.repository';
import type { CategoriesRepository } from '../repositories/categories.repository';

const CATEGORY = { id: 'category_1', slug: 'painting', parentId: null };

function build() {
  const categoryTemplatesRepository = {
    findById: jest.fn().mockResolvedValue(null),
    findByIdForCategory: jest.fn().mockResolvedValue(null),
    listByCategory: jest.fn().mockResolvedValue([]),
    findActiveForCategory: jest.fn().mockResolvedValue(null),
    findActiveForCategoryBySlug: jest.fn().mockResolvedValue(null),
    createAndActivate: jest.fn().mockResolvedValue({ id: 'template_1', fields: [] }),
  };
  const categoriesRepository = {
    findById: jest.fn().mockResolvedValue(CATEGORY),
    findBySlug: jest.fn().mockResolvedValue(CATEGORY),
  };

  const service = new CategoryTemplatesService(
    categoryTemplatesRepository as unknown as CategoryTemplatesRepository,
    categoriesRepository as unknown as CategoriesRepository,
  );

  return { service, categoryTemplatesRepository, categoriesRepository };
}

const numberField = (over: Record<string, unknown> = {}) => ({
  key: 'area',
  label: 'Approximate area',
  type: 'NUMBER' as const,
  required: true,
  order: 0,
  ...over,
});

describe('CategoryTemplatesService', () => {
  describe('getActiveForSlug', () => {
    it('returns the active template for a configured category', async () => {
      const { service, categoryTemplatesRepository } = build();
      categoryTemplatesRepository.findActiveForCategoryBySlug.mockResolvedValue({
        id: 'template_1',
        fields: [
          {
            key: 'area',
            label: 'Area',
            type: 'NUMBER',
            required: true,
            order: 0,
            options: null,
            validation: { min: 10 },
          },
        ],
      });

      const result = await service.getActiveForSlug('painting');

      expect(result.template).toEqual({
        id: 'template_1',
        fields: [
          {
            key: 'area',
            label: 'Area',
            type: 'NUMBER',
            required: true,
            order: 0,
            options: null,
            validation: { min: 10 },
          },
        ],
      });
    });

    it('returns a clean { template: null } for a category with nothing configured, not an error', async () => {
      const { service } = build();

      const result = await service.getActiveForSlug('painting');

      expect(result).toEqual({ template: null });
    });

    it('404s for a category slug that does not exist at all', async () => {
      const { service, categoriesRepository } = build();
      categoriesRepository.findBySlug.mockResolvedValue(null);

      await expect(service.getActiveForSlug('nope')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('authorization', () => {
    it.each(['CLIENT', 'PROVIDER'])('rejects listVersions by %s', async (role) => {
      const { service } = build();
      await expect(service.listVersions(role as never, 'category_1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it.each(['CLIENT', 'PROVIDER'])('rejects createAndActivate by %s', async (role) => {
      const { service } = build();
      await expect(
        service.createAndActivate(role as never, 'user_1', 'category_1', {
          fields: [numberField()],
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it.each(['ADMIN', 'SUPER_ADMIN'])('allows createAndActivate by %s', async (role) => {
      const { service, categoryTemplatesRepository } = build();

      await service.createAndActivate(role as never, 'user_1', 'category_1', {
        fields: [numberField()],
      });

      expect(categoryTemplatesRepository.createAndActivate).toHaveBeenCalled();
    });

    it('404s a category id that does not exist, even for an admin', async () => {
      const { service, categoriesRepository } = build();
      categoriesRepository.findById.mockResolvedValue(null);

      await expect(
        service.createAndActivate('ADMIN' as never, 'user_1', 'nope', { fields: [numberField()] }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('createAndActivate — field validation', () => {
    it('rejects duplicate field keys', async () => {
      const { service } = build();

      await expect(
        service.createAndActivate('ADMIN' as never, 'user_1', 'category_1', {
          fields: [numberField({ key: 'area' }), numberField({ key: 'area', label: 'Again' })],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('accepts a SELECT field with options', async () => {
      const { service, categoryTemplatesRepository } = build();

      await service.createAndActivate('ADMIN' as never, 'user_1', 'category_1', {
        fields: [
          {
            key: 'property-type',
            label: 'Property type',
            type: 'SELECT',
            required: true,
            order: 0,
            options: ['apartment', 'house', 'commercial'],
          },
        ],
      });

      expect(categoryTemplatesRepository.createAndActivate).toHaveBeenCalledWith(
        'category_1',
        'user_1',
        [
          expect.objectContaining({
            key: 'property-type',
            options: ['apartment', 'house', 'commercial'],
          }),
        ],
        [],
        false,
      );
    });

    it('rejects a SELECT field with no options', async () => {
      const { service } = build();

      await expect(
        service.createAndActivate('ADMIN' as never, 'user_1', 'category_1', {
          fields: [{ key: 'x', label: 'X', type: 'SELECT', required: false, order: 0 }],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects options on a type that does not use them', async () => {
      const { service } = build();

      await expect(
        service.createAndActivate('ADMIN' as never, 'user_1', 'category_1', {
          fields: [numberField({ options: ['a', 'b'] })],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects duplicate options', async () => {
      const { service } = build();

      await expect(
        service.createAndActivate('ADMIN' as never, 'user_1', 'category_1', {
          fields: [
            {
              key: 'x',
              label: 'X',
              type: 'SELECT',
              required: false,
              order: 0,
              options: ['a', 'a'],
            },
          ],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('accepts a NUMBER field with min/max validation', async () => {
      const { service, categoryTemplatesRepository } = build();

      await service.createAndActivate('ADMIN' as never, 'user_1', 'category_1', {
        fields: [numberField({ validation: { min: 10, max: 5000 } })],
      });

      expect(categoryTemplatesRepository.createAndActivate).toHaveBeenCalledWith(
        'category_1',
        'user_1',
        [expect.objectContaining({ validation: { min: 10, max: 5000 } })],
        [],
        false,
      );
    });

    it('rejects validation.max less than validation.min', async () => {
      const { service } = build();

      await expect(
        service.createAndActivate('ADMIN' as never, 'user_1', 'category_1', {
          fields: [numberField({ validation: { min: 100, max: 10 } })],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a validation key that is not appropriate for the field type', async () => {
      const { service } = build();

      await expect(
        service.createAndActivate('ADMIN' as never, 'user_1', 'category_1', {
          fields: [numberField({ validation: { minLength: 5 } })],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects validation on a BOOLEAN field entirely', async () => {
      const { service } = build();

      await expect(
        service.createAndActivate('ADMIN' as never, 'user_1', 'category_1', {
          fields: [
            {
              key: 'x',
              label: 'X',
              type: 'BOOLEAN',
              required: false,
              order: 0,
              validation: { min: 1 },
            },
          ],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a non-numeric validation value', async () => {
      const { service } = build();

      await expect(
        service.createAndActivate('ADMIN' as never, 'user_1', 'category_1', {
          fields: [numberField({ validation: { min: 'ten' } as never })],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('defaults order to the field’s position when not given', async () => {
      const { service, categoryTemplatesRepository } = build();

      await service.createAndActivate('ADMIN' as never, 'user_1', 'category_1', {
        fields: [
          numberField({ key: 'a', order: undefined }),
          numberField({ key: 'b', order: undefined }),
        ],
      });

      const written = categoryTemplatesRepository.createAndActivate.mock.calls[0][2];
      expect(written[0].order).toBe(0);
      expect(written[1].order).toBe(1);
    });
  });

  describe('getVersion', () => {
    it('reads scoped by categoryId, not merely the template id', async () => {
      const { service, categoryTemplatesRepository } = build();
      categoryTemplatesRepository.findByIdForCategory.mockResolvedValue({
        id: 'template_1',
        fields: [],
      });

      await service.getVersion('ADMIN' as never, 'category_1', 'template_1');

      expect(categoryTemplatesRepository.findByIdForCategory).toHaveBeenCalledWith(
        'category_1',
        'template_1',
      );
    });

    it('404s a template id that does not belong to the category in the path', async () => {
      const { service, categoryTemplatesRepository } = build();
      // Scoped query returns nothing — the template exists, just under a
      // different category, which findByIdForCategory's own where clause
      // excludes at the database level rather than this test asserting a
      // filter applied after the fact.
      categoryTemplatesRepository.findByIdForCategory.mockResolvedValue(null);

      await expect(
        service.getVersion('ADMIN' as never, 'category_1', 'template_from_elsewhere'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it.each(['CLIENT', 'PROVIDER'])('rejects getVersion by %s', async (role) => {
      const { service } = build();
      await expect(
        service.getVersion(role as never, 'category_1', 'template_1'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('assertModeAndLocation — the shared validator Jobs and Direct Contracts both call', () => {
    it('is a no-op when the category has no active template — today’s unrestricted behaviour is preserved', async () => {
      const { service, categoryTemplatesRepository } = build();
      categoryTemplatesRepository.findActiveForCategory.mockResolvedValue(null);

      await expect(
        service.assertModeAndLocation('category_1', 'REMOTE', null),
      ).resolves.toBeUndefined();
    });

    it('accepts a serviceMode that is one of allowedModes', async () => {
      const { service, categoryTemplatesRepository } = build();
      categoryTemplatesRepository.findActiveForCategory.mockResolvedValue({
        allowedModes: ['ONSITE'],
        locationRequired: false,
      });

      await expect(
        service.assertModeAndLocation('category_1', 'ONSITE', null),
      ).resolves.toBeUndefined();
    });

    it('rejects a serviceMode that is not in allowedModes', async () => {
      const { service, categoryTemplatesRepository } = build();
      categoryTemplatesRepository.findActiveForCategory.mockResolvedValue({
        allowedModes: ['ONSITE'],
        locationRequired: false,
      });

      await expect(
        service.assertModeAndLocation('category_1', 'REMOTE', null),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('treats an empty allowedModes as "no restriction configured yet", not "no mode is allowed"', async () => {
      const { service, categoryTemplatesRepository } = build();
      categoryTemplatesRepository.findActiveForCategory.mockResolvedValue({
        allowedModes: [],
        locationRequired: false,
      });

      // A template exists (unlike the "no active template" case above),
      // but nothing configured allowedModes yet — any value must pass.
      await expect(
        service.assertModeAndLocation('category_1', 'HYBRID', null),
      ).resolves.toBeUndefined();
    });

    it('does not reject an absent serviceMode even when allowedModes is configured', async () => {
      const { service, categoryTemplatesRepository } = build();
      categoryTemplatesRepository.findActiveForCategory.mockResolvedValue({
        allowedModes: ['ONSITE'],
        locationRequired: false,
      });

      await expect(
        service.assertModeAndLocation('category_1', undefined, null),
      ).resolves.toBeUndefined();
    });

    it('accepts a supplied locationCoarse when locationRequired is true', async () => {
      const { service, categoryTemplatesRepository } = build();
      categoryTemplatesRepository.findActiveForCategory.mockResolvedValue({
        allowedModes: ['ONSITE'],
        locationRequired: true,
      });

      await expect(
        service.assertModeAndLocation('category_1', 'ONSITE', 'Bangalore'),
      ).resolves.toBeUndefined();
    });

    it('rejects a missing locationCoarse when locationRequired is true', async () => {
      const { service, categoryTemplatesRepository } = build();
      categoryTemplatesRepository.findActiveForCategory.mockResolvedValue({
        allowedModes: ['ONSITE'],
        locationRequired: true,
      });

      await expect(
        service.assertModeAndLocation('category_1', 'ONSITE', null),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('leaves locationCoarse optional when locationRequired is false', async () => {
      const { service, categoryTemplatesRepository } = build();
      categoryTemplatesRepository.findActiveForCategory.mockResolvedValue({
        allowedModes: ['REMOTE'],
        locationRequired: false,
      });

      await expect(
        service.assertModeAndLocation('category_1', 'REMOTE', undefined),
      ).resolves.toBeUndefined();
    });

    it('the hybrid example: only configured modes pass, all three included means all three pass', async () => {
      const { service, categoryTemplatesRepository } = build();
      categoryTemplatesRepository.findActiveForCategory.mockResolvedValue({
        allowedModes: ['ONSITE', 'REMOTE', 'HYBRID'],
        locationRequired: true,
      });

      for (const mode of ['ONSITE', 'REMOTE', 'HYBRID'] as const) {
        await expect(
          service.assertModeAndLocation('category_1', mode, 'Bangalore'),
        ).resolves.toBeUndefined();
      }
    });
  });
});
