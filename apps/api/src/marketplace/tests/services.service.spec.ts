import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ServicesService } from '../services/services.service';
import { CategoriesService } from '../services/categories.service';
import { CategoriesRepository } from '../repositories/categories.repository';
import { ServicesRepository } from '../repositories/services.repository';
import { ProfilesRepository } from '../../profiles/repositories/profiles.repository';
import type { CreateServiceDto } from '../dto/service.dto';
import type { SearchServicesDto } from '../dto/search-services.dto';

const OWNER = {
  id: 'profile_1',
  userId: 'user_1',
  user: { role: 'PROVIDER', capabilities: [{ capability: 'PROVIDER' }] },
};

function build() {
  const profiles = { findByUserId: jest.fn().mockResolvedValue(OWNER) };
  const categories = { findById: jest.fn().mockResolvedValue({ id: 'cat_1' }) };
  const categoriesService = { resolveFilterIds: jest.fn().mockResolvedValue(['cat_1']) };
  const services = {
    create: jest.fn().mockImplementation((data) => Promise.resolve({ id: 'svc_1', ...data })),
    update: jest.fn().mockImplementation((id, data) => Promise.resolve({ id, ...data })),
    softDelete: jest.fn().mockResolvedValue({ id: 'svc_1' }),
    findById: jest.fn().mockResolvedValue({
      id: 'svc_1',
      profileId: 'profile_1',
      status: 'DRAFT',
      publishedAt: null,
    }),
    findPublicById: jest.fn().mockResolvedValue(null),
    listByProfile: jest.fn().mockResolvedValue([]),
    countByProfile: jest.fn().mockResolvedValue(0),
    search: jest.fn().mockResolvedValue([]),
    countSearch: jest.fn().mockResolvedValue(0),
    searchProviders: jest.fn().mockResolvedValue([]),
    countSearchProviders: jest.fn().mockResolvedValue(0),
    findProviderCards: jest.fn().mockResolvedValue([]),
    countExistingSkills: jest.fn().mockResolvedValue(0),
    findSkillIds: jest.fn().mockResolvedValue([]),
    addImage: jest.fn().mockResolvedValue({ id: 'image_1' }),
    removeImage: jest.fn().mockResolvedValue({ count: 1 }),
    countImages: jest.fn().mockResolvedValue(0),
    addSkill: jest.fn().mockResolvedValue({}),
    removeSkill: jest.fn().mockResolvedValue({}),
  };

  const mediaService = {
    assertAttachable: jest.fn().mockResolvedValue({ id: 'media_1' }),
    signViewUrl: jest.fn().mockResolvedValue('https://signed.example/img'),
  };
  const service = new ServicesService(
    profiles as unknown as ProfilesRepository,
    services as unknown as ServicesRepository,
    categories as unknown as CategoriesRepository,
    categoriesService as unknown as CategoriesService,
    mediaService as never,
  );
  return { service, profiles, services, categories, categoriesService, mediaService };
}

const dto: CreateServiceDto = {
  title: 'Wedding photography',
  description: 'A description long enough to satisfy validation rules.',
  categoryId: 'cat_1',
  startingPrice: 25000,
  deliveryDays: 7,
};

const searchDto = (over: Partial<SearchServicesDto> = {}): SearchServicesDto =>
  ({ page: 1, limit: 20, sort: 'newest', ...over }) as SearchServicesDto;

describe('ServicesService', () => {
  describe('create', () => {
    it('rejects a client', async () => {
      const { service, profiles, services } = build();
      profiles.findByUserId.mockResolvedValue({ ...OWNER, user: { role: 'CLIENT' } });
      await expect(service.create('user_1', dto)).rejects.toBeInstanceOf(ForbiddenException);
      expect(services.create).not.toHaveBeenCalled();
    });

    it('rejects an unknown category', async () => {
      const { service, categories, services } = build();
      categories.findById.mockResolvedValue(null);
      await expect(service.create('user_1', dto)).rejects.toBeInstanceOf(BadRequestException);
      expect(services.create).not.toHaveBeenCalled();
    });

    it('rejects unknown skills', async () => {
      const { service, services } = build();
      services.countExistingSkills.mockResolvedValue(1);
      await expect(
        service.create('user_1', { ...dto, skillIds: ['s1', 's2'] }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(services.create).not.toHaveBeenCalled();
    });

    it('takes the owning profile from the session, never the payload', async () => {
      const { service, services } = build();
      await service.create('user_1', {
        ...dto,
        profileId: 'someone-else',
        status: 'PUBLISHED',
      } as CreateServiceDto & { profileId: string; status: string });

      const written = services.create.mock.calls[0][0];
      expect(written.profileId).toBe('profile_1');
      expect(written).not.toHaveProperty('status');
      expect(written).not.toHaveProperty('publishedAt');
      expect(written).not.toHaveProperty('deletedAt');
    });

    it('starts unpublished by leaving status to the schema default', async () => {
      const { service, services } = build();
      await service.create('user_1', dto);
      expect(services.create.mock.calls[0][0]).not.toHaveProperty('status');
    });

    it('normalises tags: trims, lowercases, dedupes, drops blanks', async () => {
      const { service, services } = build();
      await service.create('user_1', {
        ...dto,
        tags: ['  Balloon Artistry ', 'balloon artistry', '', '   ', 'Sri Lankan'],
      });
      expect(services.create.mock.calls[0][0].tags).toEqual(['balloon artistry', 'sri lankan']);
    });
  });

  describe('update', () => {
    it("rejects editing another provider's listing", async () => {
      const { service, services } = build();
      services.findById.mockResolvedValue({ id: 'svc_1', profileId: 'someone_else' });
      await expect(service.update('user_1', 'svc_1', { title: 'x' })).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(services.update).not.toHaveBeenCalled();
    });

    it('404s on an unknown listing', async () => {
      const { service, services } = build();
      services.findById.mockResolvedValue(null);
      await expect(service.update('user_1', 'nope', { title: 'x' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('never writes status through the update path', async () => {
      const { service, services } = build();
      await service.update('user_1', 'svc_1', { title: 'New title' });
      expect(services.update.mock.calls[0][1]).not.toHaveProperty('status');
    });

    it('leaves skills alone when skillIds is absent', async () => {
      const { service, services } = build();
      await service.update('user_1', 'svc_1', { title: 'x' });
      expect(services.addSkill).not.toHaveBeenCalled();
      expect(services.removeSkill).not.toHaveBeenCalled();
    });

    // Absent and empty must mean different things, or clearing every skill
    // from a listing becomes impossible.
    it('clears skills when skillIds is an empty array', async () => {
      const { service, services } = build();
      services.findSkillIds.mockResolvedValue([{ skillId: 's1' }]);
      await service.update('user_1', 'svc_1', { skillIds: [] });
      expect(services.removeSkill).toHaveBeenCalledWith('svc_1', 's1');
    });

    it('adds and removes only what changed', async () => {
      const { service, services } = build();
      services.findSkillIds.mockResolvedValue([{ skillId: 'keep' }, { skillId: 'drop' }]);
      services.countExistingSkills.mockResolvedValue(2);
      await service.update('user_1', 'svc_1', { skillIds: ['keep', 'add'] });
      expect(services.addSkill).toHaveBeenCalledWith('svc_1', 'add');
      expect(services.removeSkill).toHaveBeenCalledWith('svc_1', 'drop');
      expect(services.addSkill).toHaveBeenCalledTimes(1);
      expect(services.removeSkill).toHaveBeenCalledTimes(1);
    });
  });

  describe('visibility', () => {
    it('stamps publishedAt on first publish', async () => {
      const { service, services } = build();
      await service.setVisibility('user_1', 'svc_1', { status: 'PUBLISHED' });
      expect(services.update.mock.calls[0][1].publishedAt).toBeInstanceOf(Date);
    });

    // Otherwise a provider could bump their listing up the "newest" sort
    // just by toggling visibility off and on.
    it('does not refresh publishedAt on republish', async () => {
      const { service, services } = build();
      services.findById.mockResolvedValue({
        id: 'svc_1',
        profileId: 'profile_1',
        status: 'UNPUBLISHED',
        publishedAt: new Date('2020-01-01'),
      });
      await service.setVisibility('user_1', 'svc_1', { status: 'PUBLISHED' });
      expect(services.update.mock.calls[0][1]).not.toHaveProperty('publishedAt');
    });

    it('is idempotent when the status already matches', async () => {
      const { service, services } = build();
      services.findById.mockResolvedValue({
        id: 'svc_1',
        profileId: 'profile_1',
        status: 'PUBLISHED',
        publishedAt: new Date(),
      });
      await service.setVisibility('user_1', 'svc_1', { status: 'PUBLISHED' });
      expect(services.update).not.toHaveBeenCalled();
    });

    it("rejects changing another provider's listing", async () => {
      const { service, services } = build();
      services.findById.mockResolvedValue({ id: 'svc_1', profileId: 'other', status: 'DRAFT' });
      await expect(
        service.setVisibility('user_1', 'svc_1', { status: 'PUBLISHED' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('delete', () => {
    it('soft deletes rather than removing the row', async () => {
      const { service, services } = build();
      await service.remove('user_1', 'svc_1');
      expect(services.softDelete).toHaveBeenCalledWith('svc_1');
    });

    it("rejects deleting another provider's listing", async () => {
      const { service, services } = build();
      services.findById.mockResolvedValue({ id: 'svc_1', profileId: 'other' });
      await expect(service.remove('user_1', 'svc_1')).rejects.toBeInstanceOf(ForbiddenException);
      expect(services.softDelete).not.toHaveBeenCalled();
    });
  });

  describe('public reads', () => {
    // A distinct response for "exists but hidden" would let anyone probe
    // for unpublished listings.
    it('404s for a hidden listing, indistinguishably from a missing one', async () => {
      const { service } = build();
      await expect(service.findPublicById('svc_1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects an unknown category slug in search', async () => {
      const { service, categoriesService } = build();
      categoriesService.resolveFilterIds.mockResolvedValue(null);
      await expect(service.search(searchDto({ category: 'nope' }))).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('passes the rolled-up category ids to the repository', async () => {
      const { service, services, categoriesService } = build();
      categoriesService.resolveFilterIds.mockResolvedValue(['parent', 'child']);
      await service.search(searchDto({ category: 'photography' }));
      expect(services.search.mock.calls[0][0].categoryIds).toEqual(['parent', 'child']);
    });
  });

  describe('pagination envelope', () => {
    it('reports totalPages and next/previous', async () => {
      const { service, services } = build();
      services.countSearch.mockResolvedValue(45);
      const result = await service.search(searchDto({ page: 2, limit: 20 }));
      expect(result.pagination).toEqual({
        page: 2,
        limit: 20,
        total: 45,
        totalPages: 3,
        hasNext: true,
        hasPrevious: true,
      });
    });

    it('returns empty data with valid metadata past the last page', async () => {
      const { service, services } = build();
      services.countSearch.mockResolvedValue(5);
      const result = await service.search(searchDto({ page: 99, limit: 20 }));
      expect(result.data).toEqual([]);
      expect(result.pagination.hasNext).toBe(false);
      expect(result.pagination.totalPages).toBe(1);
    });
  });

  describe('provider discovery', () => {
    it('counts distinct providers, not matching services', async () => {
      const { service, services } = build();
      services.countSearchProviders.mockResolvedValue(2);
      services.searchProviders.mockResolvedValue([
        { profileId: 'p1', _min: { startingPrice: 100 }, _max: { createdAt: new Date() } },
        { profileId: 'p2', _min: { startingPrice: 200 }, _max: { createdAt: new Date() } },
      ]);
      services.findProviderCards.mockResolvedValue([{ id: 'p1' }, { id: 'p2' }]);
      const result = await service.searchProviders(searchDto());
      expect(result.pagination.total).toBe(2);
      expect(services.countSearch).not.toHaveBeenCalled();
    });

    // `IN` does not preserve order, so the ranking from the grouped query
    // has to be reapplied — otherwise the sort silently degrades.
    it('restores the ranked order after fetching cards', async () => {
      const { service, services } = build();
      services.searchProviders.mockResolvedValue([
        { profileId: 'p2', _min: { startingPrice: 100 }, _max: { createdAt: null } },
        { profileId: 'p1', _min: { startingPrice: 200 }, _max: { createdAt: null } },
      ]);
      // Deliberately returned in the opposite order.
      services.findProviderCards.mockResolvedValue([{ id: 'p1' }, { id: 'p2' }]);
      const result = await service.searchProviders(searchDto());
      expect(result.data.map((row) => (row as { id: string }).id)).toEqual(['p2', 'p1']);
    });

    it('carries the cheapest matching price as the "from" signal', async () => {
      const { service, services } = build();
      services.searchProviders.mockResolvedValue([
        { profileId: 'p1', _min: { startingPrice: 1500 }, _max: { createdAt: null } },
      ]);
      services.findProviderCards.mockResolvedValue([{ id: 'p1' }]);
      const result = await service.searchProviders(searchDto());
      expect((result.data[0] as { startingFrom: number }).startingFrom).toBe(1500);
    });
  });

  describe('images', () => {
    it('attaches an uploaded image the caller owns', async () => {
      const { service, services, mediaService } = build();
      await service.addImage('user_1', 'svc_1', 'media_1');

      expect(mediaService.assertAttachable).toHaveBeenCalledWith('user_1', 'media_1');
      expect(services.addImage).toHaveBeenCalledWith('svc_1', 'media_1', 0);
    });

    // The attack: attaching another provider's photograph to your listing.
    it('refuses to attach a file the caller does not own', async () => {
      const { service, services, mediaService } = build();
      mediaService.assertAttachable.mockRejectedValue(new ForbiddenException());

      await expect(service.addImage('user_1', 'svc_1', 'someone_elses')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(services.addImage).not.toHaveBeenCalled();
    });

    it("refuses to attach an image to another provider's service", async () => {
      const { service, services } = build();
      services.findById.mockResolvedValue({ id: 'svc_1', profileId: 'someone_else' });

      await expect(service.addImage('user_1', 'svc_1', 'media_1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(services.addImage).not.toHaveBeenCalled();
    });

    // Capped because these load on every card of a browse page, unlike a
    // portfolio piece which a client opens deliberately.
    it('enforces the image cap', async () => {
      const { service, services } = build();
      services.countImages.mockResolvedValue(8);

      await expect(service.addImage('user_1', 'svc_1', 'media_1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(services.addImage).not.toHaveBeenCalled();
    });

    it('assigns sort order from the current count rather than trusting a client', async () => {
      const { service, services } = build();
      services.countImages.mockResolvedValue(3);
      await service.addImage('user_1', 'svc_1', 'media_1');
      expect(services.addImage).toHaveBeenCalledWith('svc_1', 'media_1', 3);
    });

    it('removes an image scoped to its own service', async () => {
      const { service, services } = build();
      await service.removeImage('user_1', 'svc_1', 'image_1');
      // Scoped by both ids: checking the image id alone would let any owner
      // delete any other listing's image.
      expect(services.removeImage).toHaveBeenCalledWith('svc_1', 'image_1');
    });

    it('404s when the image does not belong to that service', async () => {
      const { service, services } = build();
      services.removeImage.mockResolvedValue({ count: 0 });
      await expect(service.removeImage('user_1', 'svc_1', 'other')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
