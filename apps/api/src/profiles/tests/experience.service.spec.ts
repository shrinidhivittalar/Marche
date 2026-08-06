import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ExperienceService } from '../services/experience.service';
import type { ProfilesRepository } from '../repositories/profiles.repository';
import type { ExperienceRepository } from '../repositories/experience.repository';

function buildProfile(overrides: Record<string, unknown> = {}) {
  return { id: 'profile_1', userId: 'user_1', user: { role: 'PROVIDER' }, ...overrides };
}

describe('ExperienceService', () => {
  let profilesRepository: jest.Mocked<ProfilesRepository>;
  let experienceRepository: jest.Mocked<ExperienceRepository>;
  let service: ExperienceService;

  beforeEach(() => {
    profilesRepository = { findByUserId: jest.fn() } as unknown as jest.Mocked<ProfilesRepository>;
    experienceRepository = {
      create: jest.fn(),
      findById: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    } as unknown as jest.Mocked<ExperienceRepository>;
    service = new ExperienceService(profilesRepository, experienceRepository);
  });

  describe('create', () => {
    it('rejects an end date before the start date', async () => {
      profilesRepository.findByUserId.mockResolvedValue(buildProfile() as never);

      await expect(
        service.create('user_1', {
          company: 'Acme',
          position: 'Dev',
          startDate: '2024-01-01',
          endDate: '2023-01-01',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects currentlyWorking=true combined with an end date', async () => {
      profilesRepository.findByUserId.mockResolvedValue(buildProfile() as never);

      await expect(
        service.create('user_1', {
          company: 'Acme',
          position: 'Dev',
          startDate: '2024-01-01',
          endDate: '2024-06-01',
          currentlyWorking: true,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('allows overlapping experience dates — real work histories overlap', async () => {
      profilesRepository.findByUserId.mockResolvedValue(buildProfile() as never);
      experienceRepository.create.mockResolvedValue({ id: 'e_1' } as never);

      // No prior-experience lookup happens at all — nothing to reject against.
      await expect(
        service.create('user_1', {
          company: 'Side Gig',
          position: 'Consultant',
          startDate: '2024-01-01',
        }),
      ).resolves.toBeDefined();
    });

    it('rejects a Client adding work experience', async () => {
      profilesRepository.findByUserId.mockResolvedValue(
        buildProfile({ user: { role: 'CLIENT' } }) as never,
      );

      await expect(
        service.create('user_1', { company: 'Acme', position: 'Dev', startDate: '2024-01-01' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });
});
