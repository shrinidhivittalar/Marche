import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PortfolioService } from '../services/portfolio.service';
import type { ProfilesRepository } from '../repositories/profiles.repository';
import type { PortfolioRepository } from '../repositories/portfolio.repository';

function buildProfile(overrides: Record<string, unknown> = {}) {
  return { id: 'profile_1', userId: 'user_1', user: { role: 'PROVIDER' }, ...overrides };
}

describe('PortfolioService', () => {
  let profilesRepository: jest.Mocked<ProfilesRepository>;
  let portfolioRepository: jest.Mocked<PortfolioRepository>;
  let service: PortfolioService;
  let mediaService: { assertAttachable: jest.Mock };

  beforeEach(() => {
    profilesRepository = { findByUserId: jest.fn() } as unknown as jest.Mocked<ProfilesRepository>;
    portfolioRepository = {
      create: jest.fn(),
      findById: jest.fn(),
      update: jest.fn(),
      softDelete: jest.fn(),
    } as unknown as jest.Mocked<PortfolioRepository>;
    // Every attached file is verified as the caller's own and fully
    // uploaded before a portfolio piece is written.
    mediaService = { assertAttachable: jest.fn().mockResolvedValue({ id: 'media_1' }) };
    service = new PortfolioService(profilesRepository, portfolioRepository, mediaService as never);
  });

  describe('create', () => {
    it('rejects a Client trying to add a portfolio item', async () => {
      profilesRepository.findByUserId.mockResolvedValue(
        buildProfile({ user: { role: 'CLIENT' } }) as never,
      );

      await expect(
        service.create('user_1', { title: 't', description: 'd', mediaIds: ['media_1'] }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(portfolioRepository.create).not.toHaveBeenCalled();
    });

    it('creates a portfolio item for a Provider', async () => {
      profilesRepository.findByUserId.mockResolvedValue(buildProfile() as never);
      portfolioRepository.create.mockResolvedValue({ id: 'p_1' } as never);

      await service.create('user_1', {
        title: 't',
        description: 'd',
        mediaIds: ['media_1'],
      });

      expect(portfolioRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ profileId: 'profile_1', mediaIds: ['media_1'] }),
      );
    });
  });

  describe('update', () => {
    it('rejects updating a portfolio item owned by a different profile', async () => {
      profilesRepository.findByUserId.mockResolvedValue(buildProfile() as never);
      portfolioRepository.findById.mockResolvedValue({
        id: 'p_1',
        profileId: 'someone_elses_profile',
      } as never);

      await expect(service.update('user_1', 'p_1', { title: 'new' })).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(portfolioRepository.update).not.toHaveBeenCalled();
    });

    it('throws NotFoundException for a missing item', async () => {
      profilesRepository.findByUserId.mockResolvedValue(buildProfile() as never);
      portfolioRepository.findById.mockResolvedValue(null);

      await expect(service.update('user_1', 'missing', {})).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('remove', () => {
    it('soft-deletes rather than hard-deletes, so historical references survive', async () => {
      profilesRepository.findByUserId.mockResolvedValue(buildProfile() as never);
      portfolioRepository.findById.mockResolvedValue({
        id: 'p_1',
        profileId: 'profile_1',
      } as never);

      await service.remove('user_1', 'p_1');

      expect(portfolioRepository.softDelete).toHaveBeenCalledWith('p_1');
    });
  });

  describe('media ownership', () => {
    beforeEach(() => {
      profilesRepository.findByUserId.mockResolvedValue(buildProfile() as never);
    });

    // The attack this prevents: provider B putting provider A's photograph
    // on their own portfolio by passing A's media id.
    it('refuses to attach a file the caller does not own', async () => {
      mediaService.assertAttachable.mockRejectedValue(new ForbiddenException());

      await expect(
        service.create('user_1', {
          title: 't',
          description: 'd',
          mediaIds: ['someone-elses-media'],
        } as never),
      ).rejects.toBeInstanceOf(ForbiddenException);

      // Nothing is written when a single file fails the check.
      expect(portfolioRepository.create).not.toHaveBeenCalled();
    });

    it('checks every file, not just the first', async () => {
      await service.create('user_1', {
        title: 't',
        description: 'd',
        mediaIds: ['media_1', 'media_2', 'media_3'],
      } as never);

      expect(mediaService.assertAttachable).toHaveBeenCalledTimes(3);
    });
  });
});
