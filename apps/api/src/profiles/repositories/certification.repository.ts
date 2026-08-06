import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { Certification, Prisma } from '@marche/db';

@Injectable()
export class CertificationRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: Prisma.CertificationUncheckedCreateInput): Promise<Certification> {
    return this.prisma.client.certification.create({ data });
  }

  findById(id: string) {
    return this.prisma.client.certification.findUnique({ where: { id } });
  }

  update(id: string, data: Prisma.CertificationUpdateInput): Promise<Certification> {
    return this.prisma.client.certification.update({ where: { id }, data });
  }

  delete(id: string): Promise<Certification> {
    return this.prisma.client.certification.delete({ where: { id } });
  }
}
