import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { JobsService } from '../services/jobs.service';
import { JobsRepository } from '../repositories/jobs.repository';
import { ProfilesRepository } from '../../profiles/repositories/profiles.repository';
import { CategoriesRepository } from '../../marketplace/repositories/categories.repository';
import { CategoriesService } from '../../marketplace/services/categories.service';
import type { CreateJobDto } from '../dto/job.dto';
import type { SearchJobsDto } from '../dto/search-jobs.dto';
import type { JobStatus } from '@marche/db';

const OWNER = { id: 'profile_1', userId: 'user_1', user: { role: 'CLIENT' } };

function build(jobOverrides: Record<string, unknown> = {}) {
  const profiles = { findByUserId: jest.fn().mockResolvedValue(OWNER) };
  const categories = { findById: jest.fn().mockResolvedValue({ id: 'cat_1' }) };
  const jobs = {
    create: jest.fn().mockImplementation((data) => Promise.resolve({ id: 'job_1', ...data })),
    update: jest.fn().mockImplementation((id, data) => Promise.resolve({ id, ...data })),
    softDelete: jest.fn().mockResolvedValue({ id: 'job_1' }),
    findById: jest.fn().mockResolvedValue({
      id: 'job_1',
      clientProfileId: 'profile_1',
      status: 'DRAFT' as JobStatus,
      publishedAt: null,
      ...jobOverrides,
    }),
    findByIdForOwner: jest.fn().mockResolvedValue({ id: 'job_1', title: 'A requirement' }),
    listByProfile: jest.fn().mockResolvedValue([]),
    countByProfile: jest.fn().mockResolvedValue(0),
    findPublicById: jest.fn().mockResolvedValue({ id: 'job_1', title: 'A requirement' }),
    search: jest.fn().mockResolvedValue([]),
    countSearch: jest.fn().mockResolvedValue(0),
  };
  const categoriesService = { resolveFilterIds: jest.fn().mockResolvedValue(['cat_1']) };

  const service = new JobsService(
    jobs as unknown as JobsRepository,
    profiles as unknown as ProfilesRepository,
    categories as unknown as CategoriesRepository,
    categoriesService as unknown as CategoriesService,
  );
  return { service, jobs, profiles, categories, categoriesService };
}

const searchDto = (over: Partial<SearchJobsDto> = {}): SearchJobsDto =>
  ({ page: 1, limit: 20, sort: 'newest', ...over }) as SearchJobsDto;

const dto: CreateJobDto = {
  title: 'Wedding photographer needed',
  description: 'A description long enough to satisfy the validation rules.',
  categoryId: 'cat_1',
};

describe('JobsService', () => {
  describe('create', () => {
    it('rejects a provider', async () => {
      const { service, profiles, jobs } = build();
      profiles.findByUserId.mockResolvedValue({ ...OWNER, user: { role: 'PROVIDER' } });

      await expect(service.create('user_1', dto)).rejects.toBeInstanceOf(ForbiddenException);
      expect(jobs.create).not.toHaveBeenCalled();
    });

    it('rejects an unknown category', async () => {
      const { service, categories, jobs } = build();
      categories.findById.mockResolvedValue(null);

      await expect(service.create('user_1', dto)).rejects.toBeInstanceOf(BadRequestException);
      expect(jobs.create).not.toHaveBeenCalled();
    });

    it('creates as a draft owned by the caller, never live', async () => {
      const { service, jobs } = build();

      await service.create('user_1', dto);

      const written = jobs.create.mock.calls[0][0];
      expect(written.clientProfileId).toBe('profile_1');
      // Neither is set here — the schema defaults own them, so a
      // requirement cannot be created already published.
      expect(written.status).toBeUndefined();
      expect(written.publishedAt).toBeUndefined();
    });

    it('ignores a clientProfileId supplied by the caller', async () => {
      const { service, jobs } = build();

      await service.create('user_1', {
        ...dto,
        clientProfileId: 'profile_someone_else',
        status: 'PUBLISHED',
      } as CreateJobDto);

      const written = jobs.create.mock.calls[0][0];
      expect(written.clientProfileId).toBe('profile_1');
      expect(written.status).toBeUndefined();
    });
  });

  describe('ownership', () => {
    it("refuses to update another client's requirement", async () => {
      const { service, jobs } = build({ clientProfileId: 'profile_2' });

      await expect(service.update('user_1', 'job_1', { title: 'Hijacked' })).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(jobs.update).not.toHaveBeenCalled();
    });

    it('404s for a requirement that does not exist', async () => {
      const { service, jobs } = build();
      jobs.findById.mockResolvedValue(null);

      await expect(service.publish('user_1', 'job_1')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('publish', () => {
    it('stamps publishedAt on first publish', async () => {
      const { service, jobs } = build();

      await service.publish('user_1', 'job_1');

      const [, data] = jobs.update.mock.calls[0];
      expect(data.status).toBe('PUBLISHED');
      expect(data.publishedAt).toBeInstanceOf(Date);
    });

    it('is idempotent for an already-published requirement', async () => {
      const { service, jobs } = build({ status: 'PUBLISHED' });

      await service.publish('user_1', 'job_1');

      expect(jobs.update).not.toHaveBeenCalled();
    });

    it('refuses to publish a cancelled requirement', async () => {
      const { service, jobs } = build({ status: 'CANCELLED' });

      await expect(service.publish('user_1', 'job_1')).rejects.toBeInstanceOf(BadRequestException);
      expect(jobs.update).not.toHaveBeenCalled();
    });

    it('re-checks the role at publish, not only at create', async () => {
      const { service, profiles, jobs } = build();
      // Drafted as a client, then the account changed before publishing.
      profiles.findByUserId.mockResolvedValue({ ...OWNER, user: { role: 'PROVIDER' } });

      await expect(service.publish('user_1', 'job_1')).rejects.toBeInstanceOf(ForbiddenException);
      expect(jobs.update).not.toHaveBeenCalled();
    });
  });

  describe('cancel', () => {
    it('cancels a published requirement and stamps cancelledAt', async () => {
      const { service, jobs } = build({ status: 'PUBLISHED' });

      await service.cancel('user_1', 'job_1');

      const [, data] = jobs.update.mock.calls[0];
      expect(data.status).toBe('CANCELLED');
      expect(data.cancelledAt).toBeInstanceOf(Date);
    });

    it('refuses to cancel a filled requirement', async () => {
      const { service, jobs } = build({ status: 'FILLED' });

      await expect(service.cancel('user_1', 'job_1')).rejects.toBeInstanceOf(BadRequestException);
      expect(jobs.update).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('refuses to edit a cancelled requirement', async () => {
      const { service, jobs } = build({ status: 'CANCELLED' });

      await expect(
        service.update('user_1', 'job_1', { title: 'New title' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(jobs.update).not.toHaveBeenCalled();
    });

    it('allows editing a published requirement', async () => {
      const { service, jobs } = build({ status: 'PUBLISHED' });

      await service.update('user_1', 'job_1', { title: 'A corrected title' });

      expect(jobs.update).toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('soft-deletes a draft', async () => {
      const { service, jobs } = build();

      await service.remove('user_1', 'job_1');

      expect(jobs.softDelete).toHaveBeenCalledWith('job_1');
    });

    it('refuses to delete a published requirement, pointing at cancel', async () => {
      const { service, jobs } = build({ status: 'PUBLISHED' });

      await expect(service.remove('user_1', 'job_1')).rejects.toThrow(/[Cc]ancel/);
      expect(jobs.softDelete).not.toHaveBeenCalled();
    });
  });

  describe('discovery', () => {
    it('404s for a requirement that is not publicly visible', async () => {
      const { service, jobs } = build();
      // The repository applies publicJobWhere, so a draft simply is not
      // found — the service never has to know why.
      jobs.findPublicById.mockResolvedValue(null);

      await expect(service.findPublicById('job_1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects an unknown category slug rather than returning nothing', async () => {
      const { service, categoriesService, jobs } = build();
      categoriesService.resolveFilterIds.mockResolvedValue(null);

      await expect(service.search(searchDto({ category: 'nope' }))).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(jobs.search).not.toHaveBeenCalled();
    });

    it('expands a category slug to the category and its children', async () => {
      const { service, categoriesService, jobs } = build();
      categoriesService.resolveFilterIds.mockResolvedValue(['cat_1', 'cat_child']);

      await service.search(searchDto({ category: 'photography' }));

      const [filters] = jobs.search.mock.calls[0];
      expect(filters.categoryIds).toEqual(['cat_1', 'cat_child']);
    });

    it('passes the same filters to the page query and the count', async () => {
      const { service, jobs } = build();

      await service.search(searchDto({ q: 'wedding', location: 'Bangalore', minBudget: 10000 }));

      // A page whose total came from different filters is a paginator that
      // reports the wrong number of pages.
      expect(jobs.search.mock.calls[0][0]).toEqual(jobs.countSearch.mock.calls[0][0]);
    });

    it('converts event date bounds to Date objects', async () => {
      const { service, jobs } = build();

      await service.search(
        searchDto({
          eventFrom: '2026-09-01T00:00:00.000Z',
          eventUntil: '2026-12-01T00:00:00.000Z',
        }),
      );

      const [filters] = jobs.search.mock.calls[0];
      expect(filters.eventFrom).toBeInstanceOf(Date);
      expect(filters.eventUntil).toBeInstanceOf(Date);
    });

    it('returns the standard pagination envelope', async () => {
      const { service, jobs } = build();
      jobs.search.mockResolvedValue([{ id: 'job_1' }]);
      jobs.countSearch.mockResolvedValue(45);

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
  });

  describe('markFilled', () => {
    it('moves a published requirement to FILLED', async () => {
      const { service, jobs } = build({ status: 'PUBLISHED' });

      await service.markFilled('job_1');

      const [, data] = jobs.update.mock.calls[0];
      expect(data.status).toBe('FILLED');
    });

    it('refuses to fill a draft — a proposal cannot exist for an unpublished requirement', async () => {
      const { service, jobs } = build();

      await expect(service.markFilled('job_1')).rejects.toBeInstanceOf(BadRequestException);
      expect(jobs.update).not.toHaveBeenCalled();
    });

    it('refuses to fill a cancelled requirement', async () => {
      const { service, jobs } = build({ status: 'CANCELLED' });

      await expect(service.markFilled('job_1')).rejects.toBeInstanceOf(BadRequestException);
      expect(jobs.update).not.toHaveBeenCalled();
    });
  });
});
