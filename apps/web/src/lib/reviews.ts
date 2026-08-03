import type { Review, TalentProfile } from '../types';

export interface ReviewStats {
  rating: number;
  reviewCount: number;
  liveReviewCount: number;
}

export function getReviewStats(talent: Pick<TalentProfile, 'rating' | 'reviewCount'>, reviews: Review[]): ReviewStats {
  if (reviews.length === 0) {
    return {
      rating: talent.rating,
      reviewCount: talent.reviewCount,
      liveReviewCount: 0,
    };
  }

  const liveRatingTotal = reviews.reduce((total, review) => total + review.rating, 0);
  const priorRatingTotal = talent.rating * talent.reviewCount;
  const reviewCount = talent.reviewCount + reviews.length;

  return {
    rating: (priorRatingTotal + liveRatingTotal) / reviewCount,
    reviewCount,
    liveReviewCount: reviews.length,
  };
}

export function formatRating(rating: number): string {
  return rating.toFixed(2);
}
