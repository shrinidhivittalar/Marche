import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { Prisma, Review } from '@marche/db';

const REVIEW_FIELDS = {
  id: true,
  connectionId: true,
  reviewerUserId: true,
  revieweeProfileId: true,
  rating: true,
  comment: true,
  createdAt: true,
} satisfies Prisma.ReviewSelect;

@Injectable()
export class ReviewsRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(
    connectionId: string,
    reviewerUserId: string,
    revieweeProfileId: string,
    rating: number,
    comment: string,
  ): Promise<Review> {
    return this.prisma.client.review.create({
      data: { connectionId, reviewerUserId, revieweeProfileId, rating, comment },
      select: REVIEW_FIELDS,
    });
  }

  findByConnectionAndReviewer(connectionId: string, reviewerUserId: string) {
    return this.prisma.client.review.findUnique({
      where: { connectionId_reviewerUserId: { connectionId, reviewerUserId } },
      select: REVIEW_FIELDS,
    });
  }

  // Both reviews on a connection — there are at most two, one per party
  // (enforced by the unique constraint on [connectionId, reviewerUserId]).
  // Used to decide whether a review's sibling exists yet, which is what
  // "blind until both sides submit" is checking.
  listByConnection(connectionId: string) {
    return this.prisma.client.review.findMany({
      where: { connectionId },
      select: REVIEW_FIELDS,
    });
  }

  // Unpaginated and unfiltered by visibility — ReviewsService applies the
  // blind-until-both-or-window rule and paginates after, since visibility
  // depends on a sibling row that a WHERE clause here can't cheaply express
  // for a table this small.
  listByProfile(profileId: string) {
    return this.prisma.client.review.findMany({
      where: { revieweeProfileId: profileId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: REVIEW_FIELDS,
    });
  }

  // Every review this user has written, newest first — the client-history
  // panel's source. Unfiltered by visibility for the same reason
  // listByProfile is: the sibling-exists half of "blind until both or the
  // window elapses" needs a second query ReviewsService already knows how
  // to run, so filtering happens there, not here.
  listByReviewer(reviewerUserId: string) {
    return this.prisma.client.review.findMany({
      where: { reviewerUserId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: {
        ...REVIEW_FIELDS,
        connection: { select: { job: { select: { id: true, title: true } } } },
        revieweeProfile: { select: { displayName: true } },
      },
    });
  }

  // How many reviews exist per connection, for the connections given — the
  // sibling-exists half of "blind until both sides submit or the window
  // elapses". There are at most two per connection (one per party), so a
  // count of 2 means both parties have reviewed.
  async countByConnectionIds(connectionIds: string[]): Promise<Map<string, number>> {
    if (connectionIds.length === 0) return new Map();
    const rows = await this.prisma.client.review.groupBy({
      by: ['connectionId'],
      where: { connectionId: { in: connectionIds } },
      _count: { _all: true },
    });
    return new Map(rows.map((row) => [row.connectionId, row._count._all]));
  }
}
