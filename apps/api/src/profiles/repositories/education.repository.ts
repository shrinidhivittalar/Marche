import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { Education, Prisma } from '@marche/db';

@Injectable()
export class EducationRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: Prisma.EducationUncheckedCreateInput): Promise<Education> {
    return this.prisma.client.education.create({ data });
  }

  findById(id: string) {
    return this.prisma.client.education.findUnique({ where: { id } });
  }

  update(id: string, data: Prisma.EducationUpdateInput): Promise<Education> {
    return this.prisma.client.education.update({ where: { id }, data });
  }

  delete(id: string): Promise<Education> {
    return this.prisma.client.education.delete({ where: { id } });
  }
}
