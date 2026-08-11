import { Injectable, NotFoundException } from '@nestjs/common';
import { ProfilesRepository } from '../repositories/profiles.repository';
import { EducationRepository } from '../repositories/education.repository';
import { assertOwnership, assertProviderRole } from '../profile-access.util';
import type { CreateEducationDto, UpdateEducationDto } from '../dto/education.dto';
import type { Education } from '@marche/db';

@Injectable()
export class EducationService {
  constructor(
    private readonly profilesRepository: ProfilesRepository,
    private readonly educationRepository: EducationRepository,
  ) {}

  async create(userId: string, dto: CreateEducationDto): Promise<Education> {
    const profile = await this.getOwnProfile(userId);
    assertProviderRole(profile.user.role);

    return this.educationRepository.create({ profileId: profile.id, ...dto });
  }

  async update(userId: string, educationId: string, dto: UpdateEducationDto): Promise<Education> {
    const profile = await this.getOwnProfile(userId);
    const existing = await this.educationRepository.findById(educationId);
    if (!existing) {
      throw new NotFoundException('Education entry not found');
    }
    assertOwnership(existing.profileId, profile.id);

    // Passed through as sent: an explicit null clears the field, an omitted
    // one is undefined and Prisma leaves the stored value alone.
    return this.educationRepository.update(educationId, dto);
  }

  async remove(userId: string, educationId: string): Promise<void> {
    const profile = await this.getOwnProfile(userId);
    const existing = await this.educationRepository.findById(educationId);
    if (!existing) {
      throw new NotFoundException('Education entry not found');
    }
    assertOwnership(existing.profileId, profile.id);

    await this.educationRepository.delete(educationId);
  }

  private async getOwnProfile(userId: string) {
    const profile = await this.profilesRepository.findByUserId(userId);
    if (!profile) {
      throw new NotFoundException('Profile not found');
    }
    return profile;
  }
}
