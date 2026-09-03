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

  /**
   * Claims one stale-by-age row for the sweep, but only if it is still
   * PENDING — the same `updateMany`-with-status-guard pattern as
   * ProposalsRepository.transitionFromSubmitted. The age check that picked
   * this row can be stale by the time the sweep acts: the owner may have
   * called completeUpload() in between. The status test travels inside the
   * UPDATE, so that race is serialised by Postgres on the row — the sweep
   * either flips a row nobody has touched, or matches zero rows because
   * completeUpload() already moved it off PENDING.
   *
   * Returns the number of rows moved: 1 if the sweep won and should also
   * delete the object from storage, 0 if the upload completed first and
   * storage must be left alone.
   */
  markStaleFailed(id: string): Promise<number> {
    return this.prisma.client.media
      .updateMany({
        where: { id, status: 'PENDING' },
        data: { status: 'FAILED' },
      })
      .then((result) => result.count);
  }
}
