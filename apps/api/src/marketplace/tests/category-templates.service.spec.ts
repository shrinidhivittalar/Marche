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

  describe('getVersionForSlug — the public read for a Job’s locked (possibly non-active) version', () => {
    it('resolves the category by slug, then the specific version scoped to it — no admin gate', async () => {
      const { service, categoryTemplatesRepository, categoriesRepository } = build();
      categoryTemplatesRepository.findByIdForCategory.mockResolvedValue({
        id: 'template_old',
        allowedModes: [],
        locationRequired: false,
        fields: [],
      });

      const result = await service.getVersionForSlug('painting', 'template_old');

      expect(categoriesRepository.findBySlug).toHaveBeenCalledWith('painting');
      expect(categoryTemplatesRepository.findByIdForCategory).toHaveBeenCalledWith(
        'category_1',
        'template_old',
      );
      expect(result).toEqual({
        template: { id: 'template_old', allowedModes: [], locationRequired: false, fields: [] },
      });
    });

    it('404s for a category slug that does not exist at all', async () => {
      const { service, categoriesRepository } = build();
      categoriesRepository.findBySlug.mockResolvedValue(null);

      await expect(service.getVersionForSlug('nope', 'template_1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('404s a template id that does not belong to the resolved category', async () => {
      const { service, categoryTemplatesRepository } = build();
      // Scoped query returns nothing — the template exists, just under a
      // different category, excluded at the database level.
      categoryTemplatesRepository.findByIdForCategory.mockResolvedValue(null);

      await expect(
        service.getVersionForSlug('painting', 'template_from_elsewhere'),
      ).rejects.toBeInstanceOf(NotFoundException);
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

  describe('resolveActiveTemplate / resolveLockedTemplate — template resolution', () => {
    it('resolveActiveTemplate delegates to the repository’s active-template lookup', async () => {
      const { service, categoryTemplatesRepository } = build();
      categoryTemplatesRepository.findActiveForCategory.mockResolvedValue({ id: 'template_1' });

      const result = await service.resolveActiveTemplate('category_1');

      expect(categoryTemplatesRepository.findActiveForCategory).toHaveBeenCalledWith('category_1');
      expect(result).toEqual({ id: 'template_1' });
    });

    it('resolveLockedTemplate re-reads the Job’s own locked version, scoped by category', async () => {
      const { service, categoryTemplatesRepository } = build();
      categoryTemplatesRepository.findByIdForCategory.mockResolvedValue({ id: 'template_1' });

      const result = await service.resolveLockedTemplate('category_1', 'template_1');

      expect(categoryTemplatesRepository.findByIdForCategory).toHaveBeenCalledWith(
        'category_1',
        'template_1',
      );
      expect(result).toEqual({ id: 'template_1' });
    });

    it('resolveLockedTemplate throws if a Job’s own lock points nowhere — data corruption, not a normal 404', async () => {
      const { service, categoryTemplatesRepository } = build();
      categoryTemplatesRepository.findByIdForCategory.mockResolvedValue(null);

      await expect(
        service.resolveLockedTemplate('category_1', 'template_missing'),
      ).rejects.toThrow();
    });
  });

  describe('assertJobRequirements — the shared validator Jobs and Direct Contracts both call', () => {
    const template = (over: Record<string, unknown> = {}) => ({
      id: 'template_1',
      allowedModes: [] as string[],
      locationRequired: false,
      fields: [] as Record<string, unknown>[],
      ...over,
    });

    it('a null template (nothing configured) is entirely unrestricted, and categoryData is dropped', () => {
      const { service } = build();

      expect(service.assertJobRequirements(null, 'REMOTE', null, undefined)).toBeNull();
    });

    it('a null template rejects categoryData that was supplied anyway — there is nothing for it to mean', () => {
      const { service } = build();

      expect(() => service.assertJobRequirements(null, undefined, null, { area: 10 })).toThrow(
        BadRequestException,
      );
    });

    it('accepts a serviceMode that is one of allowedModes', () => {
      const { service } = build();

      expect(
        service.assertJobRequirements(
          template({ allowedModes: ['ONSITE'] }),
          'ONSITE',
          null,
          undefined,
        ),
      ).toEqual({});
    });

    it('rejects a serviceMode that is not in allowedModes', () => {
      const { service } = build();

      expect(() =>
        service.assertJobRequirements(
          template({ allowedModes: ['ONSITE'] }),
          'REMOTE',
          null,
          undefined,
        ),
      ).toThrow(BadRequestException);
    });

    it('treats an empty allowedModes as "no restriction configured yet", not "no mode is allowed"', () => {
      const { service } = build();

      // A template exists (unlike the null-template case above), but
      // nothing configured allowedModes yet — any value must pass.
      expect(
        service.assertJobRequirements(template({ allowedModes: [] }), 'HYBRID', null, undefined),
      ).toEqual({});
    });

    it('does not reject an absent serviceMode even when allowedModes is configured', () => {
      const { service } = build();

      expect(
        service.assertJobRequirements(
          template({ allowedModes: ['ONSITE'] }),
          undefined,
          null,
          undefined,
        ),
      ).toEqual({});
    });

    it('accepts a supplied locationCoarse when locationRequired is true', () => {
      const { service } = build();

      expect(
        service.assertJobRequirements(
          template({ allowedModes: ['ONSITE'], locationRequired: true }),
          'ONSITE',
          'Bangalore',
          undefined,
        ),
      ).toEqual({});
    });

    it('rejects a missing locationCoarse when locationRequired is true', () => {
      const { service } = build();

      expect(() =>
        service.assertJobRequirements(
          template({ allowedModes: ['ONSITE'], locationRequired: true }),
          'ONSITE',
          null,
          undefined,
        ),
      ).toThrow(BadRequestException);
    });

    it('leaves locationCoarse optional when locationRequired is false', () => {
      const { service } = build();

      expect(
        service.assertJobRequirements(
          template({ allowedModes: ['REMOTE'], locationRequired: false }),
          'REMOTE',
          undefined,
          undefined,
        ),
      ).toEqual({});
    });

    it('the hybrid example: only configured modes pass, all three included means all three pass', () => {
      const { service } = build();
      const hybridTemplate = template({
        allowedModes: ['ONSITE', 'REMOTE', 'HYBRID'],
        locationRequired: true,
      });

      for (const mode of ['ONSITE', 'REMOTE', 'HYBRID'] as const) {
        expect(service.assertJobRequirements(hybridTemplate, mode, 'Bangalore', undefined)).toEqual(
          {},
        );
      }
    });

    describe('categoryData', () => {
      const painting = template({
        fields: [
          {
            key: 'area',
            label: 'Area',
            type: 'NUMBER',
            required: true,
            options: null,
            validation: { min: 10, max: 5000 },
          },
          {
            key: 'rooms',
            label: 'Rooms',
            type: 'NUMBER',
            required: false,
            options: null,
            validation: null,
          },
          {
            key: 'paint-type',
            label: 'Paint type',
            type: 'SELECT',
            required: false,
            options: ['emulsion', 'enamel'],
            validation: null,
          },
          {
            key: 'finished',
            label: 'Finished',
            type: 'BOOLEAN',
            required: false,
            options: null,
            validation: null,
          },
          {
            key: 'notes',
            label: 'Notes',
            type: 'TEXT',
            required: false,
            options: null,
            validation: { maxLength: 50 },
          },
          {
            key: 'move-in-date',
            label: 'Move-in date',
            type: 'DATE',
            required: false,
            options: null,
            validation: null,
          },
          {
            key: 'colours',
            label: 'Colours',
            type: 'MULTI_SELECT',
            required: false,
            options: ['red', 'blue'],
            validation: null,
          },
        ],
      });

      it('accepts a fully valid answer set and returns it unchanged', () => {
        const { service } = build();
        const data = {
          area: 200,
          rooms: 3,
          'paint-type': 'emulsion',
          finished: true,
          notes: 'A short note',
          'move-in-date': '2026-12-01',
          colours: ['red', 'blue'],
        };

        expect(service.assertJobRequirements(painting, undefined, null, data)).toEqual(data);
      });

      it('a template with zero required fields accepts an absent categoryData, storing an empty object', () => {
        const { service } = build();
        const optionalOnly = template({
          fields: [
            {
              key: 'notes',
              label: 'Notes',
              type: 'TEXT',
              required: false,
              options: null,
              validation: null,
            },
          ],
        });

        expect(service.assertJobRequirements(optionalOnly, undefined, null, undefined)).toEqual({});
      });

      it('rejects a missing required field', () => {
        const { service } = build();

        expect(() =>
          service.assertJobRequirements(painting, undefined, null, { rooms: 3 }),
        ).toThrow(BadRequestException);
      });

      it('rejects an unknown categoryData key', () => {
        const { service } = build();

        expect(() =>
          service.assertJobRequirements(painting, undefined, null, { area: 200, ghost: true }),
        ).toThrow(BadRequestException);
      });

      it('rejects a NUMBER field given a non-number, and one outside min/max', () => {
        const { service } = build();

        expect(() =>
          service.assertJobRequirements(painting, undefined, null, { area: 'a lot' }),
        ).toThrow(BadRequestException);
        expect(() => service.assertJobRequirements(painting, undefined, null, { area: 1 })).toThrow(
          BadRequestException,
        );
      });

      it('rejects a SELECT field value outside its configured options', () => {
        const { service } = build();

        expect(() =>
          service.assertJobRequirements(painting, undefined, null, {
            area: 200,
            'paint-type': 'gold-leaf',
          }),
        ).toThrow(BadRequestException);
      });

      it('rejects a MULTI_SELECT field with a value outside its configured options', () => {
        const { service } = build();

        expect(() =>
          service.assertJobRequirements(painting, undefined, null, {
            area: 200,
            colours: ['red', 'purple'],
          }),
        ).toThrow(BadRequestException);
      });

      it('rejects a BOOLEAN field given a non-boolean', () => {
        const { service } = build();

        expect(() =>
          service.assertJobRequirements(painting, undefined, null, { area: 200, finished: 'yes' }),
        ).toThrow(BadRequestException);
      });

      it('rejects a DATE field that does not parse', () => {
        const { service } = build();

        expect(() =>
          service.assertJobRequirements(painting, undefined, null, {
            area: 200,
            'move-in-date': 'not-a-date',
          }),
        ).toThrow(BadRequestException);
      });

      it('rejects a TEXT field longer than its configured maxLength', () => {
        const { service } = build();

        expect(() =>
          service.assertJobRequirements(painting, undefined, null, {
            area: 200,
            notes: 'x'.repeat(51),
          }),
        ).toThrow(BadRequestException);
      });
    });
  });
});
