import { ForbiddenException } from '@nestjs/common';
import { CertificationService } from '../services/certification.service';
import type { ProfilesRepository } from '../repositories/profiles.repository';
import type { CertificationRepository } from '../repositories/certification.repository';

function buildProfile(overrides: Record<string, unknown> = {}) {
  return {
    id: 'profile_1',
    userId: 'user_1',
    user: { role: 'PROVIDER', capabilities: [{ capability: 'PROVIDER' }] },
    ...overrides,
  };
}

describe('CertificationService', () => {
  let profilesRepository: jest.Mocked<ProfilesRepository>;
  let certificationRepository: jest.Mocked<CertificationRepository>;
  let service: CertificationService;

  beforeEach(() => {
    profilesRepository = { findByUserId: jest.fn() } as unknown as jest.Mocked<ProfilesRepository>;
    certificationRepository = {
      create: jest.fn(),
      findById: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    } as unknown as jest.Mocked<CertificationRepository>;
    service = new CertificationService(profilesRepository, certificationRepository);
  });

  it('allows an expired certification — expiry is a display concern, not a validation failure', async () => {
    profilesRepository.findByUserId.mockResolvedValue(buildProfile() as never);
    certificationRepository.create.mockResolvedValue({ id: 'cert_1' } as never);

    await expect(
      service.create('user_1', {
        name: 'AWS Certified',
        issuingOrganization: 'Amazon',
        expiryDate: '2020-01-01',
      }),
    ).resolves.toBeDefined();
  });

  it('rejects a Client adding a certification', async () => {
    profilesRepository.findByUserId.mockResolvedValue(
      buildProfile({ user: { role: 'CLIENT' } }) as never,
    );

    await expect(
      service.create('user_1', { name: 'AWS Certified', issuingOrganization: 'Amazon' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects deleting a certification owned by a different profile', async () => {
    profilesRepository.findByUserId.mockResolvedValue(buildProfile() as never);
    certificationRepository.findById.mockResolvedValue({
      id: 'cert_1',
      profileId: 'someone_elses',
    } as never);

    await expect(service.remove('user_1', 'cert_1')).rejects.toBeInstanceOf(ForbiddenException);
  });
});
