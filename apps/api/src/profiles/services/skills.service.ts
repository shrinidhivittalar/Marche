import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ProfilesRepository } from '../repositories/profiles.repository';
import { SkillsRepository } from '../repositories/skills.repository';
import { assertOwnership, assertProviderRole } from '../profile-access.util';
import type { PaginationQueryDto } from '../dto/pagination-query.dto';
import type { AddSkillDto } from '../dto/add-skill.dto';
import type { Skill, UserSkill } from '@marche/db';

// Postgres' unique-violation code, surfaced by Prisma. Skill.name is unique,
// so two providers typing the same new skill at once is a real race.
const UNIQUE_VIOLATION = 'P2002';

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === UNIQUE_VIOLATION
  );
}

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

  /**
   * Adds a skill by id (picked from the platform list) or by name (typed by
   * the provider).
   *
   * A typed name is matched against the list case-insensitively before
   * anything is created, so "photography" attaches the same row the filters
   * already use rather than a near-duplicate beside it. Only a genuinely new
   * name creates a skill.
   */
  async addSkill(userId: string, dto: AddSkillDto): Promise<UserSkill> {
    const profile = await this.getOwnProfile(userId);
    assertProviderRole(profile.user.role);

    const skill = dto.skillId
      ? await this.skillsRepository.findSkillById(dto.skillId)
      : await this.resolveTypedSkill(dto.name as string);

    if (!skill) {
      throw new NotFoundException('Skill not found');
    }

    const existing = await this.skillsRepository.findUserSkill(profile.id, skill.id);
    if (existing) {
      throw new ConflictException('That skill has already been added to this profile');
    }

    return this.skillsRepository.addSkill(profile.id, skill.id);
  }

  private async resolveTypedSkill(name: string): Promise<Skill> {
    const existing = await this.skillsRepository.findSkillByName(name);
    if (existing) return existing;

    try {
      return await this.skillsRepository.createSkill(name);
    } catch (error) {
      // Two providers typing the same new skill at the same moment: the
      // unique constraint on Skill.name decides, and the loser reads back
      // the winner's row rather than failing on something the caller did
      // nothing wrong to cause.
      if (isUniqueViolation(error)) {
        const winner = await this.skillsRepository.findSkillByName(name);
        if (winner) return winner;
      }
      throw error;
    }
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
