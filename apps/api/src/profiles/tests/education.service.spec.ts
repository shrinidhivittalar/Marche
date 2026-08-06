import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { EducationService } from '../services/education.service';
import type { ProfilesRepository } from '../repositories/profiles.repository';
import type { EducationRepository } from '../repositories/education.repository';

function buildProfile(overrides: Record<string, unknown> = {}) {
  return { id: 'profile_1', userId: 'user_1', user: { role: 'PROVIDER' }, ...overrides };
}

describe('EducationService', () => {
  let profilesRepository: jest.Mocked<ProfilesRepository>;
  let educationRepository: jest.Mocked<EducationRepository>;
  let service: EducationService;

  beforeEach(() => {
    profilesRepository = { findByUserId: jest.fn() } as unknown as jest.Mocked<ProfilesRepository>;
    educationRepository = {
      create: jest.fn(),
      findById: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    } as unknown as jest.Mocked<EducationRepository>;
    service = new EducationService(profilesRepository, educationRepository);
  });

  it('rejects a Client adding an education entry', async () => {
    profilesRepository.findByUserId.mockResolvedValue(
      buildProfile({ user: { role: 'CLIENT' } }) as never,
    );

    await expect(
      service.create('user_1', { institution: 'MIT', degree: 'BSc' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows a future graduation year — people list expected graduation dates', async () => {
    profilesRepository.findByUserId.mockResolvedValue(buildProfile() as never);
    educationRepository.create.mockResolvedValue({ id: 'edu_1' } as never);

    const nextYear = new Date().getFullYear() + 1;
    await expect(
      service.create('user_1', { institution: 'MIT', degree: 'BSc', graduationYear: nextYear }),
    ).resolves.toBeDefined();
  });

  it('rejects removing an entry owned by a different profile', async () => {
    profilesRepository.findByUserId.mockResolvedValue(buildProfile() as never);
    educationRepository.findById.mockResolvedValue({
      id: 'edu_1',
      profileId: 'someone_elses',
    } as never);

    await expect(service.remove('user_1', 'edu_1')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('throws NotFoundException for a missing entry', async () => {
    profilesRepository.findByUserId.mockResolvedValue(buildProfile() as never);
    educationRepository.findById.mockResolvedValue(null);

    await expect(service.update('user_1', 'missing', {})).rejects.toBeInstanceOf(NotFoundException);
  });
});
