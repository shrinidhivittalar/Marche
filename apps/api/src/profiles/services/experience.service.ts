import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ProfilesRepository } from '../repositories/profiles.repository';
import { ExperienceRepository } from '../repositories/experience.repository';
import { assertOwnership, assertProviderRole } from '../profile-access.util';
import type { CreateExperienceDto, UpdateExperienceDto } from '../dto/experience.dto';
import type { Experience } from '@marche/db';

// Overlapping experiences are explicitly allowed (side gigs, transitions
// are real) — see module2-edge-cases.md. Only internally-contradictory
// dates are rejected.
function validateDates(startDate: string, endDate?: string, currentlyWorking?: boolean): void {
  if (currentlyWorking && endDate) {
    throw new BadRequestException('An entry marked as "currently working" cannot have an end date');
  }
  if (endDate && new Date(endDate) < new Date(startDate)) {
    throw new BadRequestException('endDate cannot be before startDate');
  }
}

@Injectable()
export class ExperienceService {
  constructor(
    private readonly profilesRepository: ProfilesRepository,
    private readonly experienceRepository: ExperienceRepository,
  ) {}

  async create(userId: string, dto: CreateExperienceDto): Promise<Experience> {
    const profile = await this.getOwnProfile(userId);
    assertProviderRole(profile.user.role);
    validateDates(dto.startDate, dto.endDate, dto.currentlyWorking);

    return this.experienceRepository.create({
      profileId: profile.id,
      company: dto.company,
      position: dto.position,
      description: dto.description,
      startDate: new Date(dto.startDate),
      endDate: dto.endDate ? new Date(dto.endDate) : undefined,
      currentlyWorking: dto.currentlyWorking ?? false,
    });
  }

  async update(
    userId: string,
    experienceId: string,
    dto: UpdateExperienceDto,
  ): Promise<Experience> {
    const profile = await this.getOwnProfile(userId);
    const existing = await this.experienceRepository.findById(experienceId);
    if (!existing) {
      throw new NotFoundException('Experience entry not found');
    }
    assertOwnership(existing.profileId, profile.id);

    const startDate = dto.startDate ?? existing.startDate.toISOString();
    const endDate = dto.endDate ?? (existing.endDate ? existing.endDate.toISOString() : undefined);
    const currentlyWorking = dto.currentlyWorking ?? existing.currentlyWorking;
    validateDates(startDate, endDate, currentlyWorking);

    return this.experienceRepository.update(experienceId, {
      company: dto.company,
      position: dto.position,
      description: dto.description,
      startDate: dto.startDate ? new Date(dto.startDate) : undefined,
      endDate: dto.endDate ? new Date(dto.endDate) : undefined,
      currentlyWorking: dto.currentlyWorking,
    });
  }

  async remove(userId: string, experienceId: string): Promise<void> {
    const profile = await this.getOwnProfile(userId);
    const existing = await this.experienceRepository.findById(experienceId);
    if (!existing) {
      throw new NotFoundException('Experience entry not found');
    }
    assertOwnership(existing.profileId, profile.id);

    await this.experienceRepository.delete(experienceId);
  }

  private async getOwnProfile(userId: string) {
    const profile = await this.profilesRepository.findByUserId(userId);
    if (!profile) {
      throw new NotFoundException('Profile not found');
    }
    return profile;
  }
}
