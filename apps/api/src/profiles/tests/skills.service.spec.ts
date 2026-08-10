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
      findSkillByName: jest.fn(),
      createSkill: jest.fn(),
      listAllSkills: jest.fn(),
      countAllSkills: jest.fn(),
      findUserSkill: jest.fn(),
      findUserSkillById: jest.fn(),
      addSkill: jest.fn(),
      removeSkill: jest.fn(),
    } as unknown as jest.Mocked<SkillsRepository>;
    service = new SkillsService(profilesRepository, skillsRepository);
  });

  describe('listAvailableSkills', () => {
    it('paginates using the requested page and limit', async () => {
      skillsRepository.listAllSkills.mockResolvedValue([{ id: 'skill_1' }] as never);
      skillsRepository.countAllSkills.mockResolvedValue(41);

      const result = await service.listAvailableSkills({ page: 2, limit: 20 });

      expect(skillsRepository.listAllSkills).toHaveBeenCalledWith(20, 20);
      expect(result).toEqual({ items: [{ id: 'skill_1' }], total: 41, page: 2, limit: 20 });
    });
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

      await expect(service.addSkill('user_1', { skillId: 'skill_1' })).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(skillsRepository.addSkill).not.toHaveBeenCalled();
    });

    it('rejects a Client adding a skill', async () => {
      profilesRepository.findByUserId.mockResolvedValue(
        buildProfile({ user: { role: 'CLIENT' } }) as never,
      );

      await expect(service.addSkill('user_1', { skillId: 'skill_1' })).rejects.toBeInstanceOf(
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

      await service.addSkill('user_1', { skillId: 'skill_1' });

      expect(skillsRepository.addSkill).toHaveBeenCalledWith('profile_1', 'skill_1');
    });
  });

  describe('addSkill by name', () => {
    beforeEach(() => {
      profilesRepository.findByUserId.mockResolvedValue(buildProfile() as never);
      skillsRepository.findUserSkill.mockResolvedValue(null);
      skillsRepository.addSkill.mockResolvedValue({ id: 'us_1' } as never);
    });

    it('attaches the listed skill when the typed name already exists', async () => {
      skillsRepository.findSkillByName.mockResolvedValue({
        id: 'skill_1',
        name: 'Photography',
      } as never);

      await service.addSkill('user_1', { name: 'photography' });

      // The whole point of matching case-insensitively: a typed
      // "photography" must attach the row the filters already use, not a
      // near-duplicate sitting beside it.
      expect(skillsRepository.createSkill).not.toHaveBeenCalled();
      expect(skillsRepository.addSkill).toHaveBeenCalledWith('profile_1', 'skill_1');
    });

    it('creates the skill only when nothing matches', async () => {
      skillsRepository.findSkillByName.mockResolvedValue(null);
      skillsRepository.createSkill.mockResolvedValue({
        id: 'skill_new',
        name: 'Drone piloting',
      } as never);

      await service.addSkill('user_1', { name: 'Drone piloting' });

      expect(skillsRepository.createSkill).toHaveBeenCalledWith('Drone piloting');
      expect(skillsRepository.addSkill).toHaveBeenCalledWith('profile_1', 'skill_new');
    });

    it('reads back the winner when two providers type the same new skill at once', async () => {
      skillsRepository.findSkillByName
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'skill_race', name: 'Drone piloting' } as never);
      skillsRepository.createSkill.mockRejectedValue(
        Object.assign(new Error('duplicate'), { code: 'P2002' }),
      );

      await service.addSkill('user_1', { name: 'Drone piloting' });

      // The loser of the race did nothing wrong, so it attaches the row the
      // winner created rather than failing.
      expect(skillsRepository.addSkill).toHaveBeenCalledWith('profile_1', 'skill_race');
    });

    it('does not swallow an unrelated database error', async () => {
      skillsRepository.findSkillByName.mockResolvedValue(null);
      skillsRepository.createSkill.mockRejectedValue(new Error('connection lost'));

      await expect(service.addSkill('user_1', { name: 'Drone piloting' })).rejects.toThrow(
        'connection lost',
      );
    });

    it('still refuses a Client', async () => {
      profilesRepository.findByUserId.mockResolvedValue(
        buildProfile({ user: { role: 'CLIENT' } }) as never,
      );

      await expect(service.addSkill('user_1', { name: 'Drone piloting' })).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(skillsRepository.createSkill).not.toHaveBeenCalled();
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
