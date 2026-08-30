import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ReviewsRepository } from '../repositories/reviews.repository';
import { ConnectionsService } from '../../proposals/services/connections.service';
import { ConnectionsRepository } from '../../proposals/repositories/connections.repository';
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

// Postgres' unique-violation code, surfaced by Prisma — same constant and
// check as ProposalsService's, for the same reason: the pre-check below
// (findByConnectionAndReviewer) is check-then-write, not atomic, so two
// concurrent submissions from the same reviewer can both pass it before
// either commits. The unique constraint on [connectionId, reviewerUserId]
// is what actually stops the second one; this is what turns that into a
// clean 409 instead of an unhandled 500.
const UNIQUE_VIOLATION = 'P2002';

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === UNIQUE_VIOLATION
  );
}

@Injectable()
export class ReviewsService {
  constructor(
    private readonly reviewsRepository: ReviewsRepository,
    private readonly connectionsService: ConnectionsService,
    private readonly connectionsRepository: ConnectionsRepository,
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

    // Defensive re-check (Module 01 Slice 2, module1-implementation-contract.md
    // §6.2): the Connection this reviewee is drawn from already cannot have
    // equal clientProfileId/providerProfileId (the DB CHECK constraint plus
    // the accept transaction's own invariant — see ProposalsService.accept),
    // so this can only fire if that upstream guarantee is ever broken. It
    // must fail loudly here, not let a self-review through, if it ever is.
    // Canonical User.id comparison, not Profile.id.
    const revieweeUserId = await this.profilesRepository.findUserIdById(revieweeProfileId);
    if (revieweeUserId === userId) {
      throw new ForbiddenException('You cannot review yourself');
    }

    try {
      return await this.reviewsRepository.create(
        connectionId,
        userId,
        revieweeProfileId,
        rating,
        comment,
      );
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('You have already reviewed this connection');
      }
      throw error;
    }
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

  /**
   * The three numbers ProfilesService's public profile view shows —
   * combined here rather than in ProfilesService because both halves
   * (completed-connection count, visible-review stats) already live behind
   * this module's own dependency on ProposalsModule; duplicating either
   * query or the blind-reveal rule inside profiles/ would be the same logic
   * living twice. Two independent counts, not sequential — nothing here
   * depends on the other's result.
   */
  async projectStatsForProfile(
    profileId: string,
  ): Promise<{ completedProjects: number; averageRating: number | null; totalReviews: number }> {
    const [completedProjects, { averageRating, reviewCount }] = await Promise.all([
      this.connectionsRepository.countCompletedByProfile(profileId),
      this.statsForProfile(profileId),
    ]);
    return { completedProjects, averageRating, totalReviews: reviewCount };
  }

  /**
   * "Client's recent history" — the reviews this client has written about
   * past hires, visible ones only. Same blind-reveal rule as
   * visibleReviewsForProfile, applied to the other side of the Review row:
   * that method asks "what has been said about this profile", this one
   * asks "what has this profile said about others". Showing a not-yet-
   * visible review here would leak it to a browsing provider before its
   * subject (a different, past provider) has had the chance to see or
   * reciprocate it — the exact thing the blind window exists to prevent.
   */
  async clientHistory(clientProfileId: string, limit = 5) {
    const profile = await this.profilesRepository.findById(clientProfileId);
    if (!profile) {
      throw new NotFoundException('Profile not found');
    }

    const reviews = await this.reviewsRepository.listByReviewer(profile.userId);
    const connectionIds = [...new Set(reviews.map((review) => review.connectionId))];
    const siblingCounts = await this.reviewsRepository.countByConnectionIds(connectionIds);

    return reviews
      .filter((review) => this.isVisible(review, siblingCounts.get(review.connectionId) ?? 1))
      .slice(0, limit)
      .map((review) => ({
        jobId: review.connection.job.id,
        jobTitle: review.connection.job.title,
        providerDisplayName: review.revieweeProfile?.displayName ?? null,
        rating: review.rating,
        comment: review.comment,
        createdAt: review.createdAt,
      }));
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
