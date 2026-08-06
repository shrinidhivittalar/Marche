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

  beforeEach(() => {
    profilesRepository = { findByUserId: jest.fn() } as unknown as jest.Mocked<ProfilesRepository>;
    portfolioRepository = {
      create: jest.fn(),
      findById: jest.fn(),
      update: jest.fn(),
      softDelete: jest.fn(),
    } as unknown as jest.Mocked<PortfolioRepository>;
    service = new PortfolioService(profilesRepository, portfolioRepository);
  });

  describe('create', () => {
    it('rejects a Client trying to add a portfolio item', async () => {
      profilesRepository.findByUserId.mockResolvedValue(
        buildProfile({ user: { role: 'CLIENT' } }) as never,
      );

      await expect(
        service.create('user_1', { title: 't', description: 'd', imageUrls: ['https://x/1.png'] }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(portfolioRepository.create).not.toHaveBeenCalled();
    });

    it('creates a portfolio item for a Provider', async () => {
      profilesRepository.findByUserId.mockResolvedValue(buildProfile() as never);
      portfolioRepository.create.mockResolvedValue({ id: 'p_1' } as never);

      await service.create('user_1', {
        title: 't',
        description: 'd',
        imageUrls: ['https://x/1.png'],
      });

      expect(portfolioRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ profileId: 'profile_1', imageUrls: ['https://x/1.png'] }),
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
});
