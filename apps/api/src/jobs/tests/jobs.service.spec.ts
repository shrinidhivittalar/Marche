import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { JobsService } from '../services/jobs.service';
import { JobsRepository } from '../repositories/jobs.repository';
import { ProfilesRepository } from '../../profiles/repositories/profiles.repository';
import { CategoriesRepository } from '../../marketplace/repositories/categories.repository';
import { CategoriesService } from '../../marketplace/services/categories.service';
import type { CreateJobDto } from '../dto/job.dto';
import type { SearchJobsDto } from '../dto/search-jobs.dto';
import type { JobStatus } from '@marche/db';

const OWNER = {
  id: 'profile_1',
  userId: 'user_1',
  user: { role: 'CLIENT', capabilities: [{ capability: 'CLIENT' }] },
};

function build(jobOverrides: Record<string, unknown> = {}) {
  const profiles = {
    findByUserId: jest.fn().mockResolvedValue(OWNER),
    findById: jest.fn().mockResolvedValue({ id: 'profile_1', createdAt: new Date('2026-01-01') }),
  };
  const categories = { findById: jest.fn().mockResolvedValue({ id: 'cat_1' }) };
  const jobs = {
    create: jest.fn().mockImplementation((data) => Promise.resolve({ id: 'job_1', ...data })),
    update: jest.fn().mockImplementation((id, data) => Promise.resolve({ id, ...data })),
    softDelete: jest.fn().mockResolvedValue({ id: 'job_1' }),
    claimFilled: jest.fn().mockResolvedValue(1),
    findById: jest.fn().mockResolvedValue({
      id: 'job_1',
      clientProfileId: 'profile_1',
      categoryId: 'cat_1',
      title: 'A requirement',
      status: 'DRAFT' as JobStatus,
      publishedAt: null,
      ...jobOverrides,
    }),
    findByIdForOwner: jest
      .fn()
      .mockResolvedValue({ id: 'job_1', title: 'A requirement', _count: { proposals: 3 } }),
    listByProfile: jest.fn().mockResolvedValue([]),
    countByProfile: jest.fn().mockResolvedValue(0),
    findPublicById: jest.fn().mockResolvedValue({ id: 'job_1', title: 'A requirement' }),
    search: jest.fn().mockResolvedValue([]),
    countSearch: jest.fn().mockResolvedValue(0),
    listAttachments: jest.fn().mockResolvedValue([]),
    addAttachment: jest.fn().mockResolvedValue({ id: 'attachment_1' }),
    removeAttachment: jest.fn().mockResolvedValue({ count: 1 }),
    countAttachments: jest.fn().mockResolvedValue(0),
    // Nobody hired by default: the requirement has no connection yet.
    findHiredProviderProfileId: jest.fn().mockResolvedValue(null),
    countPostedByStatus: jest
      .fn()
      .mockResolvedValue({ DRAFT: 0, PUBLISHED: 0, FILLED: 0, CANCELLED: 0 }),
  };
  const categoriesService = { resolveFilterIds: jest.fn().mockResolvedValue(['cat_1']) };
  const mediaService = {
    assertAttachable: jest.fn().mockResolvedValue({ id: 'media_1' }),
    markPrivate: jest.fn().mockResolvedValue(undefined),
    signViewUrl: jest.fn().mockResolvedValue('https://signed.example/file'),
  };
  const notificationsService = {
    jobCancelled: jest.fn().mockResolvedValue(undefined),
    jobMatched: jest.fn().mockResolvedValue(undefined),
  };

  const service = new JobsService(
    jobs as unknown as JobsRepository,
    profiles as unknown as ProfilesRepository,
    categories as unknown as CategoriesRepository,
    categoriesService as unknown as CategoriesService,
    mediaService as never,
    notificationsService as never,
  );
  return {
    service,
    jobs,
    profiles,
    categories,
    categoriesService,
    mediaService,
    notificationsService,
  };
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

    it('notifies providers with a matching service once published — Job Alerts', async () => {
      const { service, notificationsService } = build();

      await service.publish('user_1', 'job_1');

      expect(notificationsService.jobMatched).toHaveBeenCalledWith(
        'job_1',
        'cat_1',
        'A requirement',
      );
    });

    it('does not re-notify on a repeat publish of an already-published requirement', async () => {
      const { service, notificationsService } = build({ status: 'PUBLISHED' });

      await service.publish('user_1', 'job_1');

      expect(notificationsService.jobMatched).not.toHaveBeenCalled();
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

    it('notifies providers with a submitted proposal, by the cancelled job id', async () => {
      const { service, notificationsService } = build({ status: 'PUBLISHED' });

      await service.cancel('user_1', 'job_1');

      // Recipients are resolved inside NotificationsService, not here — see
      // NotificationsRepository.listSubmittedProviderUserIds. This only
      // proves Jobs actually hands it the id of the job that was cancelled.
      expect(notificationsService.jobCancelled).toHaveBeenCalledWith('job_1');
    });

    it('does not notify anyone if the cancellation itself fails', async () => {
      const { service, notificationsService } = build({ status: 'FILLED' });

      await expect(service.cancel('user_1', 'job_1')).rejects.toBeInstanceOf(BadRequestException);

      expect(notificationsService.jobCancelled).not.toHaveBeenCalled();
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

    // A provider deciding whether to bid benefits from knowing how much
    // competition there already is — Upwork shows the same thing as a
    // proposal range on every listing.
    it('exposes the proposal count on public search results, flattened from the ORM aggregate', async () => {
      const { service, jobs } = build();
      jobs.search.mockResolvedValue([{ id: 'job_1', _count: { proposals: 7 } }]);

      const result = await service.search(searchDto());

      expect(result.data[0]).toMatchObject({ proposalCount: 7 });
      expect(result.data[0]).not.toHaveProperty('_count');
    });

    it('exposes the proposal count on a single public requirement too', async () => {
      const { service, jobs } = build();
      jobs.findPublicById.mockResolvedValue({ id: 'job_1', _count: { proposals: 4 } });

      const job = await service.findPublicById('job_1');

      expect(job).toMatchObject({ proposalCount: 4 });
      expect(job).not.toHaveProperty('_count');
    });
  });

  describe('attachments', () => {
    it('refuses a file the caller does not own', async () => {
      const { service, jobs, mediaService } = build();
      mediaService.assertAttachable.mockRejectedValue(new ForbiddenException());

      await expect(
        service.addAttachment('user_1', 'job_1', 'media_owned_by_someone_else'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(jobs.addAttachment).not.toHaveBeenCalled();
    });

    it('marks the file private once it is attached', async () => {
      const { service, mediaService } = build();

      await service.addAttachment('user_1', 'job_1', 'media_1');

      // Decided by where the file landed, not claimed at upload.
      expect(mediaService.markPrivate).toHaveBeenCalledWith('media_1');
    });

    it('assigns display order from the current count, never from the client', async () => {
      const { service, jobs } = build();
      jobs.countAttachments.mockResolvedValue(3);

      await service.addAttachment('user_1', 'job_1', 'media_1');

      expect(jobs.addAttachment).toHaveBeenCalledWith('job_1', 'media_1', 3);
    });

    it('enforces the attachment cap', async () => {
      const { service, jobs } = build();
      jobs.countAttachments.mockResolvedValue(10);

      await expect(service.addAttachment('user_1', 'job_1', 'media_1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(jobs.addAttachment).not.toHaveBeenCalled();
    });

    it('refuses to attach to a cancelled requirement', async () => {
      const { service, jobs } = build({ status: 'CANCELLED' });

      await expect(service.addAttachment('user_1', 'job_1', 'media_1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(jobs.addAttachment).not.toHaveBeenCalled();
    });

    it("refuses to attach to another client's requirement", async () => {
      const { service, jobs } = build({ clientProfileId: 'profile_2' });

      await expect(service.addAttachment('user_1', 'job_1', 'media_1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(jobs.addAttachment).not.toHaveBeenCalled();
    });

    it('detaches without deleting the underlying file', async () => {
      const { service, jobs, mediaService } = build();

      await service.removeAttachment('user_1', 'job_1', 'attachment_1');

      expect(jobs.removeAttachment).toHaveBeenCalledWith('job_1', 'attachment_1');
      // The file belongs to the user, not to this requirement.
      expect(mediaService.assertAttachable).not.toHaveBeenCalled();
    });

    it('404s when detaching something that is not on this requirement', async () => {
      const { service, jobs } = build();
      jobs.removeAttachment.mockResolvedValue({ count: 0 });

      await expect(
        service.removeAttachment('user_1', 'job_1', 'attachment_elsewhere'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('lets the owner read attachments on their own draft', async () => {
      const { service, jobs } = build();

      await service.listAttachments('user_1', 'job_1');

      // No public re-read: the owner does not need the requirement to be
      // published to see their own files.
      expect(jobs.findPublicById).not.toHaveBeenCalled();
      expect(jobs.listAttachments).toHaveBeenCalledWith('job_1');
    });

    it('lets the owner read attachments once the requirement is filled', async () => {
      const { service, jobs } = build({ status: 'FILLED' as JobStatus });

      await service.listAttachments('user_1', 'job_1');

      expect(jobs.listAttachments).toHaveBeenCalledWith('job_1');
    });

    it('lets the hired provider read attachments on a filled requirement', async () => {
      // profile_1 is the caller; the requirement belongs to profile_2 and is
      // no longer publicly visible because accepting the proposal filled it.
      const { service, jobs } = build({
        clientProfileId: 'profile_2',
        status: 'FILLED' as JobStatus,
      });
      jobs.findPublicById.mockResolvedValue(null);
      jobs.findHiredProviderProfileId.mockResolvedValue('profile_1');

      await service.listAttachments('user_1', 'job_1');

      expect(jobs.listAttachments).toHaveBeenCalledWith('job_1');
    });

    it('refuses a provider who was not the one hired', async () => {
      const { service, jobs } = build({
        clientProfileId: 'profile_2',
        status: 'FILLED' as JobStatus,
      });
      jobs.findPublicById.mockResolvedValue(null);
      jobs.findHiredProviderProfileId.mockResolvedValue('profile_9');

      await expect(service.listAttachments('user_1', 'job_1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(jobs.listAttachments).not.toHaveBeenCalled();
    });

    it('refuses a non-owner when the requirement is not publicly visible', async () => {
      const { service, jobs } = build({ clientProfileId: 'profile_2' });
      jobs.findPublicById.mockResolvedValue(null);

      await expect(service.listAttachments('user_1', 'job_1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(jobs.listAttachments).not.toHaveBeenCalled();
    });

    it('allows a non-owner once the requirement is published', async () => {
      const { service, jobs } = build({ clientProfileId: 'profile_2' });
      jobs.findPublicById.mockResolvedValue({ id: 'job_1' });

      await service.listAttachments('user_1', 'job_1');

      expect(jobs.listAttachments).toHaveBeenCalledWith('job_1');
    });

    it('returns signed URLs and never the storage key', async () => {
      const { service, jobs } = build();
      jobs.listAttachments.mockResolvedValue([
        {
          id: 'attachment_1',
          displayOrder: 0,
          mediaId: 'media_1',
          media: {
            objectKey: 'users/user_1/secret-path',
            status: 'UPLOADED',
            originalFileName: 'floor-plan.pdf',
            mimeType: 'application/pdf',
          },
        },
      ]);

      const [attachment] = await service.listAttachments('user_1', 'job_1');

      expect(attachment.url).toBe('https://signed.example/file');
      expect(attachment.fileName).toBe('floor-plan.pdf');
      expect(attachment).not.toHaveProperty('media');
      expect(JSON.stringify(attachment)).not.toContain('secret-path');
    });
  });

  describe('proposal counts', () => {
    it('flattens the Prisma aggregate into a plain number', async () => {
      const { service } = build();

      const job = await service.findMineById('user_1', 'job_1');

      // `_count` is an ORM detail; a client should not have to know which
      // ORM produced its JSON.
      expect(job).toMatchObject({ proposalCount: 3 });
      expect(job).not.toHaveProperty('_count');
    });

    it('reports zero rather than undefined when nothing has been proposed', async () => {
      const { service, jobs } = build();
      jobs.findByIdForOwner.mockResolvedValue({ id: 'job_1', title: 'A requirement' });

      const job = await service.findMineById('user_1', 'job_1');

      expect(job).toMatchObject({ proposalCount: 0 });
    });
  });

  describe('clientStats', () => {
    it('404s for a profile that does not exist', async () => {
      const { service, profiles } = build();
      profiles.findById.mockResolvedValue(null);

      await expect(service.clientStats('missing')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('reports jobsPosted as everything ever live, excluding drafts', async () => {
      const { service, jobs } = build();
      jobs.countPostedByStatus.mockResolvedValue({
        DRAFT: 5,
        PUBLISHED: 2,
        FILLED: 3,
        CANCELLED: 1,
      });

      const stats = await service.clientStats('profile_1');

      expect(stats.jobsPosted).toBe(6); // PUBLISHED + FILLED + CANCELLED, not DRAFT
      expect(stats.openJobs).toBe(2);
      expect(stats.hireRate).toBeCloseTo(3 / 6);
    });

    it('reports hireRate as null rather than 0 when nothing has ever been posted', async () => {
      const { service } = build();

      const stats = await service.clientStats('profile_1');

      expect(stats.hireRate).toBeNull();
      expect(stats.jobsPosted).toBe(0);
    });
  });

  describe('claimFilled', () => {
    // The status is not read from a mocked job here, unlike every other
    // block in this file: claimFilled never reads one. Whether the claim
    // succeeds is decided by the database, and the mock's return value is
    // standing in for that answer.
    const tx = {} as never;

    it('passes only the statuses that may become FILLED', async () => {
      const { service, jobs } = build();

      await service.claimFilled(tx, 'job_1');

      const [, jobId, claimableFrom] = jobs.claimFilled.mock.calls[0];
      expect(jobId).toBe('job_1');
      // Derived from ALLOWED_TRANSITIONS rather than hard-coded, so this
      // fails loudly if the lifecycle changes and the claim is not revisited.
      expect(claimableFrom).toEqual(['PUBLISHED']);
    });

    it('hands the caller transaction straight through', async () => {
      const { service, jobs } = build();
      const ownTx = { marker: true } as never;

      await service.claimFilled(ownTx, 'job_1');

      expect(jobs.claimFilled.mock.calls[0][0]).toBe(ownTx);
    });

    it('conflicts when the requirement was already claimed', async () => {
      const { service, jobs } = build();
      // What Postgres reports to the loser of a race: the row it wanted to
      // update no longer matches, because the winner already filled it.
      jobs.claimFilled.mockResolvedValue(0);

      await expect(service.claimFilled(tx, 'job_1')).rejects.toBeInstanceOf(ConflictException);
    });
  });
});
