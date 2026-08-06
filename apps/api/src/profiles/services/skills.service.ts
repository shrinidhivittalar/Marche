import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ProfilesRepository } from '../repositories/profiles.repository';
import { SkillsRepository } from '../repositories/skills.repository';
import { assertOwnership, assertProviderRole } from '../profile-access.util';
import type { PaginationQueryDto } from '../dto/pagination-query.dto';
import type { Skill, UserSkill } from '@marche/db';

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

@Injectable()
export class SkillsService {
  constructor(
    private readonly profilesRepository: ProfilesRepository,
    private readonly skillsRepository: SkillsRepository,
  ) {}

  async listAvailableSkills(pagination: PaginationQueryDto): Promise<PaginatedResult<Skill>> {
    const { page, limit } = pagination;
    const [items, total] = await Promise.all([
      this.skillsRepository.listAllSkills((page - 1) * limit, limit),
      this.skillsRepository.countAllSkills(),
    ]);
    return { items, total, page, limit };
  }

  async addSkill(userId: string, skillId: string): Promise<UserSkill> {
    const profile = await this.getOwnProfile(userId);
    assertProviderRole(profile.user.role);

    const skill = await this.skillsRepository.findSkillById(skillId);
    if (!skill) {
      throw new NotFoundException('Skill not found');
    }

    const existing = await this.skillsRepository.findUserSkill(profile.id, skillId);
    if (existing) {
      throw new ConflictException('That skill has already been added to this profile');
    }

    return this.skillsRepository.addSkill(profile.id, skillId);
  }

  async removeSkill(userId: string, userSkillId: string): Promise<void> {
    const profile = await this.getOwnProfile(userId);
    const existing = await this.skillsRepository.findUserSkillById(userSkillId);
    if (!existing) {
      throw new NotFoundException('Skill not found on this profile');
    }
    assertOwnership(existing.profileId, profile.id);

    await this.skillsRepository.removeSkill(userSkillId);
  }

  private async getOwnProfile(userId: string) {
    const profile = await this.profilesRepository.findByUserId(userId);
    if (!profile) {
      throw new NotFoundException('Profile not found');
    }
    return profile;
  }
}
