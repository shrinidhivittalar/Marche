import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { Media, Prisma } from '@marche/db';

@Injectable()
export class MediaRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: Prisma.MediaUncheckedCreateInput): Promise<Media> {
    return this.prisma.client.media.create({ data });
  }

  findById(id: string) {
    return this.prisma.client.media.findFirst({ where: { id, deletedAt: null } });
  }

  update(id: string, data: Prisma.MediaUpdateInput): Promise<Media> {
    return this.prisma.client.media.update({ where: { id }, data });
  }

  softDelete(id: string): Promise<Media> {
    return this.prisma.client.media.update({
      where: { id },
      data: { status: 'DELETED', deletedAt: new Date() },
    });
  }

  // Abandoned uploads: a URL was issued and the file never arrived. Swept
  // lazily rather than on a schedule, because the app has no background job
  // runner and adding one for this would be more infrastructure than the
  // problem deserves.
  findStalePending(olderThan: Date, take: number) {
    return this.prisma.client.media.findMany({
      where: { status: 'PENDING', createdAt: { lt: olderThan }, deletedAt: null },
      orderBy: { createdAt: 'asc' },
      take,
    });
  }
}
