import { ConflictException, ForbiddenException } from '@nestjs/common';
import { LanguagesService } from '../services/languages.service';
import type { ProfilesRepository } from '../repositories/profiles.repository';
import type { LanguagesRepository } from '../repositories/languages.repository';

function buildProfile(overrides: Record<string, unknown> = {}) {
  return { id: 'profile_1', userId: 'user_1', user: { role: 'CLIENT' }, ...overrides };
}

describe('LanguagesService', () => {
  let profilesRepository: jest.Mocked<ProfilesRepository>;
  let languagesRepository: jest.Mocked<LanguagesRepository>;
  let service: LanguagesService;

  beforeEach(() => {
    profilesRepository = { findByUserId: jest.fn() } as unknown as jest.Mocked<ProfilesRepository>;
    languagesRepository = {
      findUserLanguage: jest.fn(),
      findUserLanguageById: jest.fn(),
      addLanguage: jest.fn(),
      removeLanguage: jest.fn(),
    } as unknown as jest.Mocked<LanguagesRepository>;
    service = new LanguagesService(profilesRepository, languagesRepository);
  });

  it('allows a Client to add a language — not Provider-restricted, unlike Portfolio/Skills/etc.', async () => {
    profilesRepository.findByUserId.mockResolvedValue(buildProfile() as never);
    languagesRepository.findUserLanguage.mockResolvedValue(null);
    languagesRepository.addLanguage.mockResolvedValue({ id: 'lang_1' } as never);

    await expect(service.addLanguage('user_1', 'English', 'FLUENT')).resolves.toBeDefined();
  });

  it('rejects adding the same language twice', async () => {
    profilesRepository.findByUserId.mockResolvedValue(buildProfile() as never);
    languagesRepository.findUserLanguage.mockResolvedValue({ id: 'lang_1' } as never);

    await expect(service.addLanguage('user_1', 'English', 'FLUENT')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(languagesRepository.addLanguage).not.toHaveBeenCalled();
  });

  it('rejects removing a language owned by a different profile', async () => {
    profilesRepository.findByUserId.mockResolvedValue(buildProfile() as never);
    languagesRepository.findUserLanguageById.mockResolvedValue({
      id: 'lang_1',
      profileId: 'someone_elses',
    } as never);

    await expect(service.removeLanguage('user_1', 'lang_1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
