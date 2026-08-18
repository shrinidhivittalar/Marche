import { ConflictException, Injectable } from '@nestjs/common';
import { ReviewsRepository } from '../repositories/reviews.repository';
import { ConnectionsService } from '../../proposals/services/connections.service';
import { ProfilesRepository } from '../../profiles/repositories/profiles.repository';
import { getOwnProfileOrThrow } from '../../profiles/profile-access.util';
import { paginate } from '../../marketplace/pagination';
import type { PaginationQueryDto } from '../../profiles/dto/pagination-query.dto';
import type { Review } from '@marche/db';

// A review stays blind until its sibling exists (both parties on the
// connection have reviewed) or this many days have passed since it was
// written — Fiverr's own number for the same rule (see
// FEATURE_GAP_ANALYSIS.md's Reviews section). Deliberately not the same
// number as Connection's 3-day auto-complete grace period: that one is
// about how long a stalled confirmation should block Reviews at all, this
// one is about how long a one-sided review stays hidden once eligible.
const REVEAL_WINDOW_DAYS = 14;

@Injectable()
export class ReviewsService {
  constructor(
    private readonly reviewsRepository: ReviewsRepository,
    private readonly connectionsService: ConnectionsService,
    private readonly profilesRepository: ProfilesRepository,
  ) {}

  /**
   * Eligibility: COMPLETED + is a party + not already reviewed.
   * ConnectionsService.findById already enforces "is a party" (404/403);
   * the other two are checked here. The reviewee is whichever side of the
   * connection the caller isn't.
   */
  async submit(
    userId: string,
    connectionId: string,
    rating: number,
    comment: string,
  ): Promise<Review> {
    const profile = await getOwnProfileOrThrow(this.profilesRepository, userId);
    const connection = await this.connectionsService.findById(userId, connectionId);

    if (connection.status !== 'COMPLETED') {
      throw new ConflictException('You can only review a connection once it is complete');
    }

    const existing = await this.reviewsRepository.findByConnectionAndReviewer(connectionId, userId);
    if (existing) {
      throw new ConflictException('You have already reviewed this connection');
    }

    const revieweeProfileId =
      connection.clientProfileId === profile.id
        ? connection.providerProfileId
        : connection.clientProfileId;

    return this.reviewsRepository.create(connectionId, userId, revieweeProfileId, rating, comment);
  }

  /** The caller's own review on this connection, if any — null otherwise. */
  async myReview(userId: string, connectionId: string): Promise<Review | null> {
    await this.connectionsService.findById(userId, connectionId); // party check
    return this.reviewsRepository.findByConnectionAndReviewer(connectionId, userId);
  }

  /** The public reviews on a profile — visible ones only, newest first. */
  async listForProfile(profileId: string, pagination: PaginationQueryDto) {
    const visible = await this.visibleReviewsForProfile(profileId);
    const { page, limit } = pagination;
    const data = visible.slice((page - 1) * limit, (page - 1) * limit + limit);
    return paginate(data, visible.length, page, limit);
  }

  /** Average rating and count over visible reviews only — a hidden review isn't public trust yet. */
  async statsForProfile(
    profileId: string,
  ): Promise<{ averageRating: number | null; reviewCount: number }> {
    const visible = await this.visibleReviewsForProfile(profileId);
    if (visible.length === 0) {
      return { averageRating: null, reviewCount: 0 };
    }
    const total = visible.reduce((sum, review) => sum + review.rating, 0);
    return { averageRating: total / visible.length, reviewCount: visible.length };
  }

  private async visibleReviewsForProfile(profileId: string): Promise<Review[]> {
    const reviews = await this.reviewsRepository.listByProfile(profileId);
    const connectionIds = [...new Set(reviews.map((review) => review.connectionId))];
    const siblingCounts = await this.reviewsRepository.countByConnectionIds(connectionIds);

    return reviews.filter((review) =>
      this.isVisible(review, siblingCounts.get(review.connectionId) ?? 1),
    );
  }

  private isVisible(review: Review, reviewsOnSameConnection: number): boolean {
    if (reviewsOnSameConnection >= 2) return true;
    const windowMs = REVEAL_WINDOW_DAYS * 24 * 60 * 60 * 1000;
    return Date.now() - review.createdAt.getTime() >= windowMs;
  }
}
