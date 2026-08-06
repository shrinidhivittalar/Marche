import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { SkillsService } from '../services/skills.service';
import type { ProfilesRepository } from '../repositories/profiles.repository';
import type { SkillsRepository } from '../repositories/skills.repository';

function buildProfile(overrides: Record<string, unknown> = {}) {
  return { id: 'profile_1', userId: 'user_1', user: { role: 'PROVIDER' }, ...overrides };
}

describe('SkillsService', () => {
  let profilesRepository: jest.Mocked<ProfilesRepository>;
  let skillsRepository: jest.Mocked<SkillsRepository>;
  let service: SkillsService;

  beforeEach(() => {
    profilesRepository = { findByUserId: jest.fn() } as unknown as jest.Mocked<ProfilesRepository>;
    skillsRepository = {
      findSkillById: jest.fn(),
      listAllSkills: jest.fn(),
      findUserSkill: jest.fn(),
      findUserSkillById: jest.fn(),
      addSkill: jest.fn(),
      removeSkill: jest.fn(),
    } as unknown as jest.Mocked<SkillsRepository>;
    service = new SkillsService(profilesRepository, skillsRepository);
  });

  describe('addSkill', () => {
    it('rejects an invalid/non-existent skill id', async () => {
      profilesRepository.findByUserId.mockResolvedValue(buildProfile() as never);
      skillsRepository.findSkillById.mockResolvedValue(null);

      await expect(service.addSkill('user_1', 'bad-id')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects a duplicate skill on the same profile', async () => {
      profilesRepository.findByUserId.mockResolvedValue(buildProfile() as never);
      skillsRepository.findSkillById.mockResolvedValue({
        id: 'skill_1',
        name: 'Photography',
      } as never);
      skillsRepository.findUserSkill.mockResolvedValue({ id: 'us_1' } as never);

      await expect(service.addSkill('user_1', 'skill_1')).rejects.toBeInstanceOf(ConflictException);
      expect(skillsRepository.addSkill).not.toHaveBeenCalled();
    });

    it('rejects a Client adding a skill', async () => {
      profilesRepository.findByUserId.mockResolvedValue(
        buildProfile({ user: { role: 'CLIENT' } }) as never,
      );

      await expect(service.addSkill('user_1', 'skill_1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('adds the skill when valid and not already present', async () => {
      profilesRepository.findByUserId.mockResolvedValue(buildProfile() as never);
      skillsRepository.findSkillById.mockResolvedValue({
        id: 'skill_1',
        name: 'Photography',
      } as never);
      skillsRepository.findUserSkill.mockResolvedValue(null);
      skillsRepository.addSkill.mockResolvedValue({ id: 'us_1' } as never);

      await service.addSkill('user_1', 'skill_1');

      expect(skillsRepository.addSkill).toHaveBeenCalledWith('profile_1', 'skill_1');
    });
  });

  describe('removeSkill', () => {
    it('rejects removing a skill association that belongs to a different profile', async () => {
      profilesRepository.findByUserId.mockResolvedValue(buildProfile() as never);
      skillsRepository.findUserSkillById.mockResolvedValue({
        id: 'us_1',
        profileId: 'someone_elses',
      } as never);

      await expect(service.removeSkill('user_1', 'us_1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(skillsRepository.removeSkill).not.toHaveBeenCalled();
    });
  });
});
