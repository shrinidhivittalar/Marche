import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { JobsService } from '../services/jobs.service';
import { JobsRepository } from '../repositories/jobs.repository';
import { ProfilesRepository } from '../../profiles/repositories/profiles.repository';
import { CategoriesRepository } from '../../marketplace/repositories/categories.repository';
import type { CreateJobDto } from '../dto/job.dto';
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
  };

  const service = new JobsService(
    jobs as unknown as JobsRepository,
    profiles as unknown as ProfilesRepository,
    categories as unknown as CategoriesRepository,
  );
  return { service, jobs, profiles, categories };
}

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
