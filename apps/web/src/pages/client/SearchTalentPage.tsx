import React, { useState } from 'react';
import {
  Search,
  Star,
  ShieldCheck,
  MapPin,
  ChevronDown,
  Award,
  Gem,
  TrendingUp,
  Crown,
  Zap,
  MessageCircle,
  Sparkles,
  ThumbsUp,
  ThumbsDown,
  Heart,
  Globe,
  CheckCircle2,
  ZoomIn,
  SlidersHorizontal,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import {
  Input,
  Checkbox,
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@marche/ui';
import { EmptyState } from '../../components/common/EmptyState';
import { CATEGORIES, LOCATIONS } from '../../data/categoryOptions';
import { formatRating, getReviewStats } from '../../lib/reviews';
import { getJobSuccessScore, getReputationBadges } from '../../lib/reputation';
import type { ReputationBadgeKey } from '../../lib/reputation';
import type { TalentProfile, EnglishLevel } from '../../types';

type SortOption = 'best' | 'rating' | 'rate_low' | 'rate_high';
type JobSuccessFilter = 'any' | '80' | '90';
type EarnedFilter = 'any' | '1' | '100' | '1k' | '10k' | 'none';
type HoursBilledFilter = 'any' | '1' | '100' | '1000';

const RATE_BUCKETS = [
  { label: 'Under ₹150/hr', test: (rate: number) => rate < 150 },
  { label: '₹150 – ₹250/hr', test: (rate: number) => rate >= 150 && rate < 250 },
  { label: '₹250 – ₹350/hr', test: (rate: number) => rate >= 250 && rate < 350 },
  { label: '₹350+/hr', test: (rate: number) => rate >= 350 },
];

const ENGLISH_LEVELS: EnglishLevel[] = ['Basic', 'Conversational', 'Fluent', 'Native or bilingual'];
const ANY_LOCATION = '__any_location__';
const ANY_SKILL = '__any_skill__';

const REPUTATION_BADGE_OPTIONS: { key: ReputationBadgeKey; label: string; icon: React.ComponentType<{ className?: string }>; className: string }[] = [
  { key: 'top_rated_plus', label: 'Top Rated Plus', icon: Gem, className: 'text-pink-600 dark:text-pink-400 bg-pink-50 dark:bg-pink-500/10' },
  { key: 'top_rated', label: 'Top Rated', icon: Award, className: 'text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-500/10' },
  { key: 'rising_talent', label: 'Rising Talent', icon: TrendingUp, className: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10' },
  { key: 'responsive', label: 'Fast Response', icon: Zap, className: 'text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10' },
  { key: 'verified_pro', label: 'Verified Pro', icon: ShieldCheck, className: 'text-primary bg-primary/10' },
];

const REPUTATION_BADGE_ICONS: Record<ReputationBadgeKey, React.ComponentType<{ className?: string }>> = {
  top_rated_plus: Gem,
  top_rated: Award,
  rising_talent: TrendingUp,
  responsive: Zap,
  verified_pro: ShieldCheck,
};
function getInsights(t: TalentProfile): string[] {
  return t.bio
    .split('.')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => `${s}.`);
}

const RATE_HISTOGRAM = [8, 14, 22, 30, 26, 18, 12, 20, 16, 10, 6, 9, 14, 11, 7];

function FilterSection({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="border-b border-border pb-4">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="w-full flex items-center justify-between text-xs font-bold text-ink uppercase tracking-wide mb-3 cursor-pointer"
      >
        {title}
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? '' : '-rotate-90'}`} />
      </button>
      {open && <div className="space-y-2">{children}</div>}
    </div>
  );
}

function RadioOption({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label className="flex items-center gap-2.5 text-xs text-ink cursor-pointer">
      <input
        type="radio"
        checked={checked}
        onChange={onChange}
        className="w-3.5 h-3.5 accent-primary cursor-pointer"
      />
      <span>{label}</span>
    </label>
  );
}

export const SearchTalentPage: React.FC = () => {
  const { navigate, savedTalentIds, toggleSavedTalent, reviews, talentProfiles } = useApp();

  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('best');
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
  const [selectedRates, setSelectedRates] = useState<Set<string>>(new Set());
  const [selectedLocations, setSelectedLocations] = useState<Set<string>>(new Set());
  const [selectedSkills, setSelectedSkills] = useState<Set<string>>(new Set());
  const [selectedBadges, setSelectedBadges] = useState<Set<ReputationBadgeKey>>(new Set());
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [jobSuccessFilter, setJobSuccessFilter] = useState<JobSuccessFilter>('any');
  const [earnedFilter, setEarnedFilter] = useState<EarnedFilter>('any');
  const [hoursBilledFilter, setHoursBilledFilter] = useState<HoursBilledFilter>('any');
  const [englishLevelFilter, setEnglishLevelFilter] = useState<'any' | EnglishLevel>('any');
  const [otherLanguages, setOtherLanguages] = useState('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const toggleInSet = <T,>(set: Set<T>, setter: (s: Set<T>) => void, value: T) => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    setter(next);
  };

  const allSkills = Array.from(new Set(talentProfiles.flatMap((t) => t.skills))).sort();

  const searchMatched = talentProfiles.filter(
    (t) =>
      t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.headline.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.bio.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.location.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const categoryCounts = CATEGORIES.filter((c) => c !== 'All').map((cat) => ({
    value: cat,
    count: searchMatched.filter((t) => t.category === cat).length,
  }));

  const rateCounts = RATE_BUCKETS.map((b) => ({
    ...b,
    count: searchMatched.filter((t) => b.test(t.hourlyRate)).length,
  }));

  const locationCounts = LOCATIONS.map((loc) => ({
    ...loc,
    count: searchMatched.filter((t) => t.location.toLowerCase().includes(loc.value.toLowerCase())).length,
  }));

  const skillCounts = allSkills.map((skill) => ({
    value: skill,
    count: searchMatched.filter((t) => t.skills.includes(skill)).length,
  }));

  const verifiedCount = searchMatched.filter((t) => t.verified).length;

  const getTalentReviewStats = (talent: TalentProfile) =>
    getReviewStats(talent, reviews.filter((review) => review.vendorId === talent.id));

  const filteredTalent = searchMatched.filter((t) => {
    const matchesCategory = selectedCategories.size === 0 || selectedCategories.has(t.category);
    const matchesRate =
      selectedRates.size === 0 || RATE_BUCKETS.some((b) => selectedRates.has(b.label) && b.test(t.hourlyRate));
    const matchesLocation =
      selectedLocations.size === 0 ||
      LOCATIONS.some((loc) => selectedLocations.has(loc.value) && t.location.toLowerCase().includes(loc.value.toLowerCase()));
    const matchesSkills = selectedSkills.size === 0 || t.skills.some((s) => selectedSkills.has(s));
    const matchesVerified = !verifiedOnly || t.verified;

    const reviewStats = getTalentReviewStats(t);
    const reputationBadges = getReputationBadges(t, reviewStats);
    const jobSuccess = getJobSuccessScore(reviewStats.rating);
    const matchesBadges = selectedBadges.size === 0 || reputationBadges.some((badge) => selectedBadges.has(badge.key));
    const matchesJobSuccess =
      jobSuccessFilter === 'any' || jobSuccess >= (jobSuccessFilter === '80' ? 80 : 90);

    const matchesEarned =
      earnedFilter === 'any' ||
      (earnedFilter === 'none' && t.earned === 0) ||
      (earnedFilter === '1' && t.earned >= 1) ||
      (earnedFilter === '100' && t.earned >= 100) ||
      (earnedFilter === '1k' && t.earned >= 1000) ||
      (earnedFilter === '10k' && t.earned >= 10000);

    const matchesHoursBilled =
      hoursBilledFilter === 'any' ||
      (hoursBilledFilter === '1' && t.hoursBilled >= 1) ||
      (hoursBilledFilter === '100' && t.hoursBilled >= 100) ||
      (hoursBilledFilter === '1000' && t.hoursBilled >= 1000);

    const matchesEnglish = englishLevelFilter === 'any' || t.englishLevel === englishLevelFilter;

    return (
      matchesCategory &&
      matchesRate &&
      matchesLocation &&
      matchesSkills &&
      matchesVerified &&
      matchesBadges &&
      matchesJobSuccess &&
      matchesEarned &&
      matchesHoursBilled &&
      matchesEnglish
    );
  });

  const sortedTalent = [...filteredTalent].sort((a, b) => {
    if (sortBy === 'rating') return getTalentReviewStats(b).rating - getTalentReviewStats(a).rating;
    if (sortBy === 'rate_low') return a.hourlyRate - b.hourlyRate;
    if (sortBy === 'rate_high') return b.hourlyRate - a.hourlyRate;
    return 0; // 'best' — default relevance order
  });

  // Top quick-filter bar: single-value convenience over the same filter state as the sidebar
  const quickLocationValue = selectedLocations.size === 1 ? Array.from(selectedLocations)[0] : '';
  const quickSkillValue = selectedSkills.size === 1 ? Array.from(selectedSkills)[0] : '';

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {toastMessage && (
        <div className="fixed bottom-20 right-6 md:bottom-6 z-50 bg-inverse text-inverse-fg px-4 py-3 rounded-2xl shadow-xl flex items-center gap-3 animate-in fade-in slide-in-from-bottom-5 duration-200 text-xs font-medium">
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header */}
      <div className="pb-6 border-b border-border">
        <h1 className="text-2xl md:text-3xl font-extrabold text-ink tracking-tight">Search Talent</h1>
        <p className="text-xs text-ink-muted mt-1">
          Filter verified service providers by category, rate, and location to find your next hire.
        </p>
      </div>

      {/* Search Bar */}
      <div className="relative max-w-xl">
        <Search className="w-4 h-4 absolute left-3.5 top-3 text-ink-muted pointer-events-none" />
        <Input
          type="text"
          placeholder="Search talent..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full bg-surface border border-border rounded-xl pl-10 pr-4 py-2.5 text-xs text-ink focus:outline-none focus:border-primary"
        />
      </div>

      {/* Quick Filter Bar */}
      <div className="flex flex-wrap items-center gap-2.5">
        <Select
          value={quickLocationValue || ANY_LOCATION}
          onValueChange={(v) => setSelectedLocations(v === ANY_LOCATION ? new Set() : new Set([v]))}
        >
          <SelectTrigger className="h-auto w-auto min-w-0 gap-2 rounded-xl px-3 py-2 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY_LOCATION}>Location</SelectItem>
            {LOCATIONS.map((loc) => (
              <SelectItem key={loc.value} value={loc.value}>
                {loc.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={quickSkillValue || ANY_SKILL}
          onValueChange={(v) => setSelectedSkills(v === ANY_SKILL ? new Set() : new Set([v]))}
        >
          <SelectTrigger className="h-auto w-auto min-w-0 gap-2 rounded-xl px-3 py-2 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY_SKILL}>Skills</SelectItem>
            {allSkills.map((skill) => (
              <SelectItem key={skill} value={skill}>
                {skill}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={englishLevelFilter}
          onValueChange={(v) => setEnglishLevelFilter(v as 'any' | EnglishLevel)}
        >
          <SelectTrigger className="h-auto w-auto min-w-0 gap-2 rounded-xl px-3 py-2 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any">English level</SelectItem>
            {ENGLISH_LEVELS.map((lvl) => (
              <SelectItem key={lvl} value={lvl}>
                {lvl}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <button
        type="button"
        onClick={() => setMobileFiltersOpen((prev) => !prev)}
        className="lg:hidden w-full flex items-center justify-between px-4 py-2.5 rounded-xl border border-border bg-surface text-xs font-semibold text-ink cursor-pointer"
      >
        <span className="flex items-center gap-2">
          <SlidersHorizontal className="w-3.5 h-3.5" />
          Filters
        </span>
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${mobileFiltersOpen ? 'rotate-180' : ''}`} />
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Filter Sidebar */}
        <aside className={`lg:col-span-1 space-y-4 ${mobileFiltersOpen ? 'block' : 'hidden'} lg:block`}>
                    <FilterSection title="Talent badge">
            {REPUTATION_BADGE_OPTIONS.map(({ key, label, icon: Icon, className }) => (
              <label key={key} className="flex items-center gap-2.5 text-xs text-ink cursor-pointer">
                <Checkbox
                  checked={selectedBadges.has(key)}
                  onCheckedChange={() => toggleInSet(selectedBadges, setSelectedBadges, key)}
                />
                <span className={`w-5 h-5 rounded-full flex items-center justify-center ${className}`}>
                  <Icon className="w-3 h-3" />
                </span>
                <span className="flex-1">{label}</span>
              </label>
            ))}
          </FilterSection>

          <FilterSection title="Hourly Rate">
            <div className="flex items-end gap-0.5 h-14 px-1">
              {RATE_HISTOGRAM.map((h, idx) => (
                <div key={idx} className="flex-1 bg-primary/30 rounded-sm" style={{ height: `${h * 3}%` }} />
              ))}
            </div>
            <div className="flex items-center justify-between text-[10px] text-ink-muted px-1 mb-2">
              <span>under ₹10</span>
              <span>₹400+</span>
            </div>
            {rateCounts.map(({ label, count }) => (
              <label key={label} className="flex items-center gap-2.5 text-xs text-ink cursor-pointer">
                <Checkbox
                  checked={selectedRates.has(label)}
                  onCheckedChange={() => toggleInSet(selectedRates, setSelectedRates, label)}
                />
                <span className="flex-1">{label}</span>
                <span className="text-ink-muted">({count})</span>
              </label>
            ))}
          </FilterSection>

          <FilterSection title="Skills">
            {skillCounts.map(({ value, count }) => (
              <label key={value} className="flex items-center gap-2.5 text-xs text-ink cursor-pointer">
                <Checkbox
                  checked={selectedSkills.has(value)}
                  onCheckedChange={() => toggleInSet(selectedSkills, setSelectedSkills, value)}
                />
                <span className="flex-1">{value}</span>
                <span className="text-ink-muted">({count})</span>
              </label>
            ))}
          </FilterSection>

          <FilterSection title="Category">
            {categoryCounts.map(({ value, count }) => (
              <label key={value} className="flex items-center gap-2.5 text-xs text-ink cursor-pointer">
                <Checkbox
                  checked={selectedCategories.has(value)}
                  onCheckedChange={() => toggleInSet(selectedCategories, setSelectedCategories, value)}
                />
                <span className="flex-1">{value}</span>
                <span className="text-ink-muted">({count})</span>
              </label>
            ))}
          </FilterSection>

          <FilterSection title="Job success">
            <RadioOption label="Any job success" checked={jobSuccessFilter === 'any'} onChange={() => setJobSuccessFilter('any')} />
            <RadioOption label="80% & up" checked={jobSuccessFilter === '80'} onChange={() => setJobSuccessFilter('80')} />
            <RadioOption label="90% & up" checked={jobSuccessFilter === '90'} onChange={() => setJobSuccessFilter('90')} />
          </FilterSection>

          <FilterSection title="Earned amount">
            <RadioOption label="Any amount earned" checked={earnedFilter === 'any'} onChange={() => setEarnedFilter('any')} />
            <RadioOption label="₹1+ earned" checked={earnedFilter === '1'} onChange={() => setEarnedFilter('1')} />
            <RadioOption label="₹100+ earned" checked={earnedFilter === '100'} onChange={() => setEarnedFilter('100')} />
            <RadioOption label="₹1K+ earned" checked={earnedFilter === '1k'} onChange={() => setEarnedFilter('1k')} />
            <RadioOption label="₹10K+ earned" checked={earnedFilter === '10k'} onChange={() => setEarnedFilter('10k')} />
            <RadioOption label="No earnings yet" checked={earnedFilter === 'none'} onChange={() => setEarnedFilter('none')} />
          </FilterSection>

          <FilterSection title="Hours billed">
            <RadioOption label="Any hours" checked={hoursBilledFilter === 'any'} onChange={() => setHoursBilledFilter('any')} />
            <RadioOption label="1+ hours billed" checked={hoursBilledFilter === '1'} onChange={() => setHoursBilledFilter('1')} />
            <RadioOption label="100+ hours billed" checked={hoursBilledFilter === '100'} onChange={() => setHoursBilledFilter('100')} />
            <RadioOption label="1,000+ hours billed" checked={hoursBilledFilter === '1000'} onChange={() => setHoursBilledFilter('1000')} />
          </FilterSection>

          <FilterSection title="Provider Info">
            <label className="flex items-center gap-2.5 text-xs text-ink cursor-pointer">
              <Checkbox checked={verifiedOnly} onCheckedChange={(c) => setVerifiedOnly(!!c)} />
              <span className="flex-1">Verified Pro</span>
              <span className="text-ink-muted">({verifiedCount})</span>
            </label>
          </FilterSection>

          <FilterSection title="English level">
            <RadioOption label="Any level" checked={englishLevelFilter === 'any'} onChange={() => setEnglishLevelFilter('any')} />
            {ENGLISH_LEVELS.map((lvl) => (
              <RadioOption
                key={lvl}
                label={lvl}
                checked={englishLevelFilter === lvl}
                onChange={() => setEnglishLevelFilter(lvl)}
              />
            ))}
          </FilterSection>

          <FilterSection title="Other languages">
            <Input
              type="text"
              placeholder="Search languages"
              value={otherLanguages}
              onChange={(e) => setOtherLanguages(e.target.value)}
              onFocus={() => showToast("Other-language filtering isn't wired up yet — Marché is still a frontend preview.")}
              className="w-full bg-surface border border-border rounded-xl px-3 py-2 text-xs text-ink focus:outline-none focus:border-primary"
            />
          </FilterSection>

          <FilterSection title="Location">
            {locationCounts.map(({ value, label, count }) => (
              <label key={value} className="flex items-center gap-2.5 text-xs text-ink cursor-pointer">
                <Checkbox
                  checked={selectedLocations.has(value)}
                  onCheckedChange={() => toggleInSet(selectedLocations, setSelectedLocations, value)}
                />
                <span className="flex-1">{label}</span>
                <span className="text-ink-muted">({count})</span>
              </label>
            ))}
          </FilterSection>

          <FilterSection title="Talent time zones">
            <button
              type="button"
              onClick={() => showToast("Time zone filtering isn't wired up yet — Marché is still a frontend preview.")}
              className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg border border-border text-xs text-ink-muted hover:text-ink transition-colors cursor-pointer"
            >
              <Globe className="w-3.5 h-3.5" />
              Any time zone
            </button>
          </FilterSection>
        </aside>

        {/* Results */}
        <div className="lg:col-span-3 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-ink-muted">{sortedTalent.length} providers found</span>
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
              <SelectTrigger className="h-auto w-auto min-w-0 gap-2 rounded-lg px-2.5 py-1.5 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="best">Sort by: Best Matches</SelectItem>
                <SelectItem value="rating">Sort by: Highest Rated</SelectItem>
                <SelectItem value="rate_low">Sort by: Rate Low to High</SelectItem>
                <SelectItem value="rate_high">Sort by: Rate High to Low</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {sortedTalent.length === 0 ? (
            <EmptyState
              title="No providers match your filters"
              description="Try adjusting your search keyword or clearing a few filters."
            />
          ) : (
            <div className="space-y-3">
              {sortedTalent.map((t, idx) => {
                const reviewStats = getTalentReviewStats(t);
                const reputationBadges = getReputationBadges(t, reviewStats);
                const jobSuccess = getJobSuccessScore(reviewStats.rating);
                const isSaved = savedTalentIds.includes(t.id);
                const isBoosted = idx === 0;
                const relatedJobs = Math.max(1, Math.round(t.jobsCompleted * 0.6));

                return (
                  <div
                    key={t.id}
                    onClick={() => navigate(`/profile/${t.id}`)}
                    className="bg-surface border border-border rounded-2xl p-5 hover:border-border-strong hover:shadow-md transition-all cursor-pointer space-y-3"
                  >
                    <div className="flex items-start gap-4">
                      <div className="relative w-24 h-24 sm:w-28 sm:h-28 shrink-0 rounded-xl overflow-hidden border border-border group/thumb">
                        <img src={t.portfolioImage} alt="" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/0 group-hover/thumb:bg-black/20 transition-colors flex items-center justify-center">
                          <div className="w-8 h-8 rounded-full bg-white/90 flex items-center justify-center opacity-0 group-hover/thumb:opacity-100 transition-opacity">
                            <ZoomIn className="w-4 h-4 text-ink" />
                          </div>
                        </div>
                        <img
                          src={t.avatar}
                          alt={t.name}
                          className="absolute -bottom-1.5 -right-1.5 w-7 h-7 rounded-full ring-2 ring-white object-cover"
                        />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              {isBoosted && (
                                <span className="flex items-center gap-1 text-[10px] font-semibold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-full px-2 py-0.5">
                                  <Zap className="w-3 h-3" />
                                  Boosted
                                </span>
                              )}
                              {reputationBadges.slice(0, 3).map((badge) => {
                                const BadgeIcon = REPUTATION_BADGE_ICONS[badge.key];
                                return (
                                  <span
                                    key={badge.key}
                                    title={badge.description}
                                    className={`flex items-center gap-1 text-[10px] font-semibold border rounded-full px-2 py-0.5 ${badge.className}`}
                                  >
                                    <BadgeIcon className="w-3 h-3" />
                                    {badge.label}
                                  </span>
                                );
                              })}
                            </div>
                            <h3 className="text-sm font-bold text-ink mt-1">{t.name.split(' ')[0]} {t.name.split(' ')[1]?.[0]}.</h3>
                            <p className="text-xs text-ink-muted mt-0.5">{t.headline}</p>
                            <p className="text-[11px] text-ink-muted mt-0.5">{t.location}</p>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleSavedTalent(t.id);
                                showToast(isSaved ? 'Removed from saved talent.' : 'Saved to your talent list.');
                              }}
                              title={isSaved ? 'Unsave' : 'Save'}
                              className={`cursor-pointer ${isSaved ? 'text-rose-500' : 'text-ink-muted hover:text-rose-500'}`}
                            >
                              <Heart className="w-4 h-4" fill={isSaved ? 'currentColor' : 'none'} />
                            </button>
                            <Button
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                showToast("Inviting talent to a job isn't wired up yet — Marché is still a frontend preview.");
                              }}
                            >
                              Invite to job
                            </Button>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 text-[11px] text-ink-muted mt-2 flex-wrap">
                          <span className="font-semibold text-ink">₹{t.hourlyRate}/hr</span>
                          <span className="flex items-center gap-1 font-semibold text-primary">
                            <Crown className="w-3.5 h-3.5" />
                            {jobSuccess}% Job Success
                          </span>
                          {t.skills.length > 2 && (
                            <span className="flex items-center gap-1">
                              <MessageCircle className="w-3.5 h-3.5" />
                              Offers consultations
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-3 text-[11px] text-ink-muted mt-1.5">
                          <span className="flex items-center gap-1 font-semibold text-amber-600">
                            <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
                            {formatRating(reviewStats.rating)} ({reviewStats.reviewCount})
                          </span>
                          {t.verified && (
                            <span className="flex items-center gap-1 font-semibold text-primary">
                              <ShieldCheck className="w-3.5 h-3.5" />
                              Verified Pro
                            </span>
                          )}
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3 h-3 shrink-0" />
                            {t.location}
                          </span>
                        </div>

                        {t.skills.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-3">
                            {t.skills.slice(0, 4).map((skill) => (
                              <span
                                key={skill}
                                className="px-2.5 py-1 rounded-lg bg-surface-subtle text-[10px] font-medium text-ink-muted border border-border"
                              >
                                {skill}
                              </span>
                            ))}
                            {t.skills.length > 4 && (
                              <span className="px-2.5 py-1 rounded-lg bg-surface-subtle text-[10px] font-medium text-ink-muted border border-border">
                                +{t.skills.length - 4}
                              </span>
                            )}
                          </div>
                        )}

                        <p className="text-xs text-ink mt-2">
                          {t.name.split(' ')[0]} has worked{' '}
                          <span className="text-primary font-semibold">
                            {relatedJobs} job{relatedJobs === 1 ? '' : 's'} related to your search
                          </span>
                        </p>
                      </div>
                    </div>

                    <div className="rounded-xl bg-bg border border-border p-3.5 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1.5 text-[11px] font-semibold text-ink">
                          <Sparkles className="w-3.5 h-3.5 text-primary" />
                          Insights about {t.name.split(' ')[0]}
                        </span>
                        <span className="flex items-center gap-2 text-ink-muted">
                          <ThumbsUp className="w-3.5 h-3.5" />
                          <ThumbsDown className="w-3.5 h-3.5" />
                        </span>
                      </div>
                      <ul className="space-y-1">
                        {getInsights(t).map((line) => (
                          <li key={line} className="flex items-start gap-2 text-[11px] text-ink-muted leading-relaxed">
                            <CheckCircle2 className="w-3 h-3 text-primary shrink-0 mt-0.5" />
                            {line}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
