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

  describe('update', () => {
    const finished = {
      id: 'e_1',
      profileId: 'profile_1',
      startDate: new Date('2024-01-01'),
      endDate: new Date('2024-06-01'),
      currentlyWorking: false,
    };

    beforeEach(() => {
      profilesRepository.findByUserId.mockResolvedValue(buildProfile() as never);
      experienceRepository.findById.mockResolvedValue(finished as never);
      experienceRepository.update.mockResolvedValue({ id: 'e_1' } as never);
    });

    it('clears the end date and re-marks the entry current in one request', async () => {
      await service.update('user_1', 'e_1', { endDate: null, currentlyWorking: true });

      // null, not undefined — undefined would leave the stored end date in
      // place and strand the entry as permanently finished.
      expect(experienceRepository.update).toHaveBeenCalledWith(
        'e_1',
        expect.objectContaining({ endDate: null, currentlyWorking: true }),
      );
    });

    it('leaves the stored end date alone when the field is omitted', async () => {
      await service.update('user_1', 'e_1', { position: 'Senior Dev' });

      expect(experienceRepository.update).toHaveBeenCalledWith(
        'e_1',
        expect.objectContaining({ endDate: undefined }),
      );
    });

    it('still rejects marking an entry current while keeping its end date', async () => {
      await expect(
        service.update('user_1', 'e_1', { currentlyWorking: true }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
