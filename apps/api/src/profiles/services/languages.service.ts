import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ProfilesRepository } from '../repositories/profiles.repository';
import { LanguagesRepository } from '../repositories/languages.repository';
import { assertOwnership } from '../profile-access.util';
import type { UserLanguage, LanguageProficiency } from '@marche/db';

// Unlike Portfolio/Skills/Experience/Education/Certification, Languages is
// NOT restricted to Providers — knowing what language a Client speaks is
// also useful for communication/matching. This wasn't explicitly decided
// in module2-edge-cases.md; flagging the assumption here rather than
// silently applying the same Provider-only rule as everything else.
@Injectable()
export class LanguagesService {
  constructor(
    private readonly profilesRepository: ProfilesRepository,
    private readonly languagesRepository: LanguagesRepository,
  ) {}

  async addLanguage(
    userId: string,
    language: string,
    proficiency: LanguageProficiency,
  ): Promise<UserLanguage> {
    const profile = await this.getOwnProfile(userId);

    const existing = await this.languagesRepository.findUserLanguage(profile.id, language);
    if (existing) {
      throw new ConflictException('That language has already been added to this profile');
    }

    return this.languagesRepository.addLanguage(profile.id, language, proficiency);
  }

  async removeLanguage(userId: string, userLanguageId: string): Promise<void> {
    const profile = await this.getOwnProfile(userId);
    const existing = await this.languagesRepository.findUserLanguageById(userLanguageId);
    if (!existing) {
      throw new NotFoundException('Language not found on this profile');
    }
    assertOwnership(existing.profileId, profile.id);

    await this.languagesRepository.removeLanguage(userLanguageId);
  }

  private async getOwnProfile(userId: string) {
    const profile = await this.profilesRepository.findByUserId(userId);
    if (!profile) {
      throw new NotFoundException('Profile not found');
    }
    return profile;
  }
}
