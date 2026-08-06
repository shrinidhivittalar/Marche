import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { Experience, Prisma } from '@marche/db';

@Injectable()
export class ExperienceRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: Prisma.ExperienceUncheckedCreateInput): Promise<Experience> {
    return this.prisma.client.experience.create({ data });
  }

  findById(id: string) {
    return this.prisma.client.experience.findUnique({ where: { id } });
  }

  update(id: string, data: Prisma.ExperienceUpdateInput): Promise<Experience> {
    return this.prisma.client.experience.update({ where: { id }, data });
  }

  delete(id: string): Promise<Experience> {
    return this.prisma.client.experience.delete({ where: { id } });
  }
}
