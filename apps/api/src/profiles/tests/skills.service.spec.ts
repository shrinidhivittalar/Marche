import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { SkillsService } from '../services/skills.service';
import { AddSkillDto } from '../dto/add-skill.dto';
import { SkillsRepository } from '../repositories/skills.repository';
import type { ProfilesRepository } from '../repositories/profiles.repository';
import type { PrismaService } from '../../prisma/prisma.service';

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

      await expect(
        service.addSkill('user_1', { skillId: 'bad-id' } as never),
      ).rejects.toBeInstanceOf(NotFoundException);
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

  describe('addSkill with neither field', () => {
    it('refuses rather than looking up an absent name', async () => {
      profilesRepository.findByUserId.mockResolvedValue(buildProfile() as never);

      await expect(service.addSkill('user_1', {} as never)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      // The bug this replaces: an absent name reached findSkillByName, which
      // matched an arbitrary row and attached an unrelated skill.
      expect(skillsRepository.findSkillByName).not.toHaveBeenCalled();
      expect(skillsRepository.addSkill).not.toHaveBeenCalled();
    });

    it.each(['', '   '])('refuses %p as a typed name', async (name) => {
      profilesRepository.findByUserId.mockResolvedValue(buildProfile() as never);

      await expect(service.addSkill('user_1', { name } as never)).rejects.toBeInstanceOf(
        BadRequestException,
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

// The DTO is where "exactly one of skillId or name" has to hold, because the
// service only ever runs after validation has passed. Tested here directly
// for that reason.
describe('AddSkillDto', () => {
  function errorsFor(body: Record<string, unknown>): string[] {
    const dto = plainToInstance(AddSkillDto, body);
    return validateSync(dto).flatMap((error) => Object.values(error.constraints ?? {}));
  }

  const SKILL_ID = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';

  it('accepts a skillId on its own', () => {
    expect(errorsFor({ skillId: SKILL_ID })).toEqual([]);
  });

  it('accepts a typed name on its own', () => {
    expect(errorsFor({ name: 'Drone piloting' })).toEqual([]);
  });

  it('rejects an empty body, which says nothing at all', () => {
    // The regression: both properties are optional, so a rule attached to
    // either was skipped entirely and {} validated clean.
    expect(errorsFor({}).join(' ')).toMatch(/either skillId .* or name/);
  });

  it('rejects both fields together, which is ambiguous', () => {
    expect(errorsFor({ skillId: SKILL_ID, name: 'Drone piloting' }).join(' ')).toMatch(/not both/);
  });

  it('rejects a whitespace-only name as no name at all', () => {
    // Collapsed to '' by the transform, so it must not count as "one field
    // was sent" and slip past the pair rule.
    expect(errorsFor({ name: '   ' }).join(' ')).toMatch(/either skillId .* or name/);
  });
});

describe('SkillsRepository.findSkillByName', () => {
  it('never issues a match-anything query for a blank name', async () => {
    const findFirst = jest.fn();
    const repository = new SkillsRepository({
      client: { skill: { findFirst } },
    } as unknown as PrismaService);

    await expect(repository.findSkillByName(undefined)).resolves.toBeNull();
    await expect(repository.findSkillByName('   ')).resolves.toBeNull();
    // Prisma would drop an undefined condition and return an arbitrary row.
    expect(findFirst).not.toHaveBeenCalled();
  });
});
