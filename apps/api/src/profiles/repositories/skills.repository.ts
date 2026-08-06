import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { UserSkill } from '@marche/db';

@Injectable()
export class SkillsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findSkillById(skillId: string) {
    return this.prisma.client.skill.findUnique({ where: { id: skillId } });
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
