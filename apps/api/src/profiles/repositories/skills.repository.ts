import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { Skill, UserSkill } from '@marche/db';

@Injectable()
export class SkillsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findSkillById(skillId: string) {
    return this.prisma.client.skill.findUnique({ where: { id: skillId } });
  }

  /**
   * Case-insensitive lookup, which is the whole defence against a typed
   * skill fragmenting the list. "Photography", "photography" and
   * "PHOTOGRAPHY" must all resolve to the one row the filters already use.
   */
  findSkillByName(name: string | undefined): Promise<Skill | null> {
    // Prisma drops an undefined condition instead of matching nothing, so an
    // absent or blank name would leave `findFirst` with no filter at all and
    // it would return an arbitrary skill. "No name" has no match by
    // definition; it must never mean "any row".
    if (!name?.trim()) return Promise.resolve(null);

    return this.prisma.client.skill.findFirst({
      where: { name: { equals: name, mode: 'insensitive' } },
    });
  }

  createSkill(name: string) {
    return this.prisma.client.skill.create({ data: { name } });
  }

  listAllSkills(skip: number, take: number) {
    return this.prisma.client.skill.findMany({ orderBy: { name: 'asc' }, skip, take });
  }

  countAllSkills() {
    return this.prisma.client.skill.count();
  }

  findUserSkill(profileId: string, skillId: string) {
    return this.prisma.client.userSkill.findUnique({
      where: { profileId_skillId: { profileId, skillId } },
    });
  }

  findUserSkillById(id: string) {
    return this.prisma.client.userSkill.findUnique({ where: { id } });
  }

  addSkill(profileId: string, skillId: string): Promise<UserSkill> {
    return this.prisma.client.userSkill.create({ data: { profileId, skillId } });
  }

  removeSkill(id: string): Promise<UserSkill> {
    return this.prisma.client.userSkill.delete({ where: { id } });
  }
}
