import type { TalentProfile } from '../types';

export type ReputationBadgeKey = 'top_rated_plus' | 'top_rated' | 'rising_talent' | 'responsive' | 'verified_pro';

export interface ReputationBadge {
  key: ReputationBadgeKey;
  label: string;
  description: string;
  className: string;
}

export interface ReputationInputs {
  rating: number;
  reviewCount: number;
}

export function getJobSuccessScore(rating: number): number {
  return Math.min(100, Math.round(rating * 20));
}

function hasFastResponse(avgResponseHours: string): boolean {
  const firstNumber = Number(avgResponseHours.match(/\d+/)?.[0] ?? Number.NaN);
  return Number.isFinite(firstNumber) && firstNumber <= 4;
}

export function getReputationBadges(
  talent: Pick<TalentProfile, 'verified' | 'jobsCompleted' | 'avgResponseHours'>,
  inputs: ReputationInputs,
): ReputationBadge[] {
  const jobSuccess = getJobSuccessScore(inputs.rating);
  const badges: ReputationBadge[] = [];

  if (talent.verified) {
    badges.push({
      key: 'verified_pro',
      label: 'Verified Pro',
      description: 'Identity and profile basics are verified in the marketplace preview.',
      className: 'text-primary bg-primary/10 border-primary/20',
    });
  }

  if (inputs.rating >= 4.95 && inputs.reviewCount >= 20 && talent.jobsCompleted >= 30 && jobSuccess >= 99) {
    badges.push({
      key: 'top_rated_plus',
      label: 'Top Rated Plus',
      description: 'Excellent rating, deep work history, and consistently high job success.',
      className: 'text-pink-600 dark:text-pink-400 bg-pink-50 dark:bg-pink-500/10 border-pink-200 dark:border-pink-500/20',
    });
  } else if (inputs.rating >= 4.85 && inputs.reviewCount >= 10 && talent.jobsCompleted >= 10) {
    badges.push({
      key: 'top_rated',
      label: 'Top Rated',
      description: 'Strong rating and proven completed-job history.',
      className: 'text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-500/10 border-sky-200 dark:border-sky-500/20',
    });
  }

  if (talent.jobsCompleted < 20 && inputs.rating >= 4.7) {
    badges.push({
      key: 'rising_talent',
      label: 'Rising Talent',
      description: 'Promising provider with strong early marketplace performance.',
      className: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20',
    });
  }

  if (hasFastResponse(talent.avgResponseHours)) {
    badges.push({
      key: 'responsive',
      label: 'Fast Response',
      description: 'Usually responds within a few hours.',
      className: 'text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/20',
    });
  }

  return badges;
}