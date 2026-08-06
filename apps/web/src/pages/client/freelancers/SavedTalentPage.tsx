import React from 'react';
import { Award, Gem, Heart, IndianRupee, MapPin, Search, ShieldCheck, Star, Trash2, TrendingUp, Zap } from 'lucide-react';
import { Button, Card } from '@marche/ui';
import { EmptyState } from '../../../components/common/EmptyState';
import { useApp } from '../../../context/AppContext';
import { formatRating, getReviewStats } from '../../../lib/reviews';
import { getReputationBadges } from '../../../lib/reputation';
import type { ReputationBadgeKey } from '../../../lib/reputation';
import { FreelancersLayout } from './FreelancersLayout';

const REPUTATION_BADGE_ICONS: Record<ReputationBadgeKey, React.ComponentType<{ className?: string }>> = {
  top_rated_plus: Gem,
  top_rated: Award,
  rising_talent: TrendingUp,
  responsive: Zap,
  verified_pro: ShieldCheck,
};

export const SavedTalentPage: React.FC = () => {
  const { navigate, savedTalentIds, toggleSavedTalent, talentProfiles, reviews } = useApp();
  const savedTalent = talentProfiles.filter((talent) => savedTalentIds.includes(talent.id));

  return (
    <FreelancersLayout activeItem="Saved talent">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-ink tracking-tight">Saved talent</h1>
          <p className="text-xs text-ink-muted mt-1">
            {savedTalent.length > 0
              ? savedTalent.length + ' provider' + (savedTalent.length === 1 ? '' : 's') + ' saved for later'
              : 'Keep a shortlist of providers you may want to hire.'}
          </p>
        </div>
        <Button variant="outline" icon={Search} onClick={() => navigate('/client/search')}>
          Find Talent
        </Button>
      </div>

      {savedTalent.length === 0 ? (
        <EmptyState
          title="No saved talent yet"
          description="Save providers from talent search or a profile page and they'll show up here."
          icon={Heart}
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {savedTalent.map((talent) => {
            const reviewStats = getReviewStats(talent, reviews.filter((review) => review.vendorId === talent.id));
            const reputationBadges = getReputationBadges(talent, reviewStats);

            return (
              <Card
                key={talent.id}
                padding="md"
                className="group cursor-pointer hover:border-border-strong hover:shadow-md transition-all"
                onClick={() => navigate('/profile/' + talent.id)}
              >
                <div className="flex items-start gap-4">
                  <img
                    src={talent.portfolioImage}
                    alt=""
                    className="w-24 h-24 rounded-xl object-cover border border-border shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <h2 className="text-sm font-bold text-ink truncate">{talent.name}</h2>
                          {talent.verified && <ShieldCheck className="w-4 h-4 text-primary shrink-0" />}
                        </div>
                        <p className="text-xs text-ink-muted mt-0.5 line-clamp-2">{talent.headline}</p>
                      </div>
                      <button
                        type="button"
                        title="Remove from saved talent"
                        aria-label="Remove from saved talent"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleSavedTalent(talent.id);
                        }}
                        className="w-8 h-8 rounded-md border border-border flex items-center justify-center text-ink-muted hover:text-danger hover:border-danger/30 hover:bg-danger-subtle transition-colors cursor-pointer shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-[11px] text-ink-muted mt-2">
                      <span className="flex items-center gap-1 font-semibold text-amber-600">
                        <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
                        {formatRating(reviewStats.rating)} ({reviewStats.reviewCount})
                      </span>
                      <span className="flex items-center gap-0.5 font-semibold text-ink">
                        <IndianRupee className="w-3 h-3" />
                        {talent.hourlyRate}/hr
                      </span>
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        {talent.location}
                      </span>
                    </div>

                    {reputationBadges.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-3">
                        {reputationBadges.slice(0, 3).map((badge) => {
                          const BadgeIcon = REPUTATION_BADGE_ICONS[badge.key];
                          return (
                            <span
                              key={badge.key}
                              title={badge.description}
                              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[10px] font-semibold ${badge.className}`}
                            >
                              <BadgeIcon className="w-3 h-3" />
                              {badge.label}
                            </span>
                          );
                        })}
                      </div>
                    )}

                    <div className="flex flex-wrap gap-1.5 mt-3">
                      {talent.skills.slice(0, 3).map((skill) => (
                        <span
                          key={skill}
                          className="px-2.5 py-1 rounded-lg bg-surface-subtle text-[10px] font-medium text-ink-muted border border-border"
                        >
                          {skill}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </FreelancersLayout>
  );
};
