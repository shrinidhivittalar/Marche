import React, { useState } from 'react';
import {
  Star,
  MapPin,
  BadgeCheck,
  ArrowLeft,
  Heart,
  Crown,
  Zap,
  MoreHorizontal,
  Share2,
  ChevronLeft,
  ChevronRight,
  Clock,
  User as UserIcon,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Button, Card } from '@marche/ui';
import { EmptyState } from '../../components/common/EmptyState';
import {
  INITIAL_TALENT,
  INITIAL_WORK_HISTORY,
  INITIAL_PORTFOLIO_ITEMS,
  INITIAL_PROJECT_CATALOG,
  INITIAL_TESTIMONIALS,
  INITIAL_EMPLOYMENT_HISTORY,
} from '../../data/mockData';

interface VendorProfilePageProps {
  id: string;
}

type JobsTab = 'completed' | 'in_progress';

const BIO_TRUNCATE_LENGTH = 220;
const PORTFOLIO_PAGE_SIZE = 3;

function getJobSuccess(rating: number): number {
  return Math.min(100, Math.round(rating * 20));
}

function formatDate(iso: string, style: 'long' | 'short' = 'long'): string {
  return new Date(iso).toLocaleDateString('en-US', { month: style, day: 'numeric', year: 'numeric' });
}

function formatMonthYear(iso: string): string {
  return new Date(`${iso}-01`).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

function getLocalTime(timezone: string): string {
  try {
    return new Date()
      .toLocaleTimeString('en-US', { timeZone: timezone, hour: 'numeric', minute: '2-digit', hour12: true })
      .toLowerCase();
  } catch {
    return '';
  }
}

export const VendorProfilePage: React.FC<VendorProfilePageProps> = ({ id }) => {
  const { goBack, currentUser } = useApp();
  const [isSaved, setIsSaved] = useState(false);
  const [bioExpanded, setBioExpanded] = useState(false);
  const [jobsTab, setJobsTab] = useState<JobsTab>('completed');
  const [portfolioPage, setPortfolioPage] = useState(0);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const baseTalent = INITIAL_TALENT.find((t) => t.id === id);

  if (!baseTalent) {
    return (
      <div className="max-w-5xl mx-auto space-y-6">
        <button
          onClick={goBack}
          className="flex items-center gap-2 text-xs font-medium text-ink-muted hover:text-ink cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back</span>
        </button>
        <EmptyState
          title="Provider not found"
          description="This profile may have been removed or is no longer available."
        />
      </div>
    );
  }

  // Viewing your own public profile should reflect what you've actually edited via
  // onboarding/EditProfilePage, not the frozen mock snapshot — there's no real backend
  // to fetch a live profile from, so currentUser is the only source of truth for your own edits.
  const talent =
    id === currentUser.id
      ? {
          ...baseTalent,
          name: currentUser.name,
          avatar: currentUser.avatar,
          headline: currentUser.companyOrTitle || baseTalent.headline,
          bio: currentUser.bio || baseTalent.bio,
          location: currentUser.location || baseTalent.location,
          hourlyRate: currentUser.hourlyRate || baseTalent.hourlyRate,
          skills: currentUser.skills?.length ? currentUser.skills : baseTalent.skills,
          verified: currentUser.verified,
        }
      : baseTalent;

  const workHistory = INITIAL_WORK_HISTORY.filter((w) => w.vendorId === talent.id);
  const completedJobs = workHistory.filter((w) => w.status === 'completed');
  const inProgressJobs = workHistory.filter((w) => w.status === 'in_progress');

  const insightTagCounts = completedJobs
    .flatMap((w) => w.tags ?? [])
    .reduce<Record<string, number>>((acc, tag) => {
      acc[tag] = (acc[tag] ?? 0) + 1;
      return acc;
    }, {});
  const sortedInsightTags = Object.entries(insightTagCounts).sort((a, b) => b[1] - a[1]);

  let portfolioItems = INITIAL_PORTFOLIO_ITEMS.filter((p) => p.vendorId === talent.id);
  if (portfolioItems.length === 0) {
    portfolioItems = [{ id: 'portfolio_fallback', vendorId: talent.id, image: talent.portfolioImage, caption: talent.headline }];
  }
  const portfolioPageCount = Math.ceil(portfolioItems.length / PORTFOLIO_PAGE_SIZE);
  const visiblePortfolioItems = portfolioItems.slice(
    portfolioPage * PORTFOLIO_PAGE_SIZE,
    portfolioPage * PORTFOLIO_PAGE_SIZE + PORTFOLIO_PAGE_SIZE
  );

  const projectCatalog = INITIAL_PROJECT_CATALOG.filter((p) => p.vendorId === talent.id);
  const testimonials = INITIAL_TESTIMONIALS.filter((t) => t.vendorId === talent.id);
  const employmentHistory = INITIAL_EMPLOYMENT_HISTORY.filter((e) => e.vendorId === talent.id);

  const jobSuccess = getJobSuccess(talent.rating);
  const bioIsLong = talent.bio.length > BIO_TRUNCATE_LENGTH;
  const displayedBio = bioIsLong && !bioExpanded ? `${talent.bio.slice(0, BIO_TRUNCATE_LENGTH).trimEnd()}…` : talent.bio;
  const activeJobs = jobsTab === 'completed' ? completedJobs : inProgressJobs;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {toastMessage && (
        <div className="fixed bottom-20 right-6 md:bottom-6 z-50 bg-inverse text-inverse-fg px-4 py-3 rounded-2xl shadow-xl flex items-center gap-3 animate-in fade-in slide-in-from-bottom-5 duration-200 text-xs font-medium">
          <span>{toastMessage}</span>
        </div>
      )}

      <button
        onClick={goBack}
        className="flex items-center gap-2 text-xs font-medium text-ink-muted hover:text-ink cursor-pointer"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Back to Marketplace</span>
      </button>

      {/* Header */}
      <Card padding="lg" className="space-y-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-4">
            <div className="relative shrink-0">
              <img
                src={talent.avatar}
                alt={talent.name}
                className="w-20 h-20 rounded-full object-cover ring-2 ring-border"
              />
              {talent.availableNow && (
                <span className="absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-emerald-500 ring-2 ring-surface" />
              )}
            </div>

            <div>
              <div className="flex items-center gap-1.5">
                <h1 className="text-xl font-extrabold text-ink">{talent.name}</h1>
                {talent.verified && <BadgeCheck className="w-5 h-5 text-primary shrink-0" />}
              </div>
              <p className="text-xs text-ink-muted mt-1 flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                {talent.location} – {getLocalTime(talent.timezone)} local time
              </p>
              {talent.availableNow && (
                <p className="text-xs text-ink-muted mt-1.5 flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5" />
                  Available now
                </p>
              )}
              <div className="flex items-center gap-1.5 mt-2.5">
                <span className="w-5 h-5 rounded-full border-2 border-primary flex items-center justify-center shrink-0">
                  <Crown className="w-3 h-3 text-primary" />
                </span>
                <span className="text-xs font-bold text-ink">{jobSuccess}% Job Success</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => showToast("That menu isn't wired up yet — Marché is still a frontend preview.")}
              title="More actions"
              className="w-9 h-9 rounded-full border border-border flex items-center justify-center text-ink-muted hover:text-ink cursor-pointer"
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>
            <Button
              size="sm"
              className="rounded-full px-5"
              onClick={() => showToast("Hiring isn't wired up yet — Marché is still a frontend preview.")}
            >
              Hire
            </Button>
            <button
              onClick={() => setIsSaved((v) => !v)}
              title={isSaved ? 'Saved' : 'Save'}
              className={`w-9 h-9 rounded-full border border-border flex items-center justify-center cursor-pointer ${
                isSaved ? 'text-rose-500' : 'text-ink-muted hover:text-rose-500'
              }`}
            >
              <Heart className="w-4 h-4" fill={isSaved ? 'currentColor' : 'none'} />
            </button>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            onClick={() => showToast("Sharing isn't wired up yet — Marché is still a frontend preview.")}
            className="text-xs font-semibold text-primary hover:underline flex items-center gap-1.5 cursor-pointer"
          >
            Share
            <Share2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </Card>

      {/* Stats + main content */}
      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6 items-start">
        <Card padding="lg" className="space-y-5 lg:sticky lg:top-6">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <div className="text-sm font-extrabold text-ink">
                ₹{talent.earned >= 1000 ? `${Math.round(talent.earned / 1000)}K+` : talent.earned}
              </div>
              <div className="text-[10px] text-ink-muted mt-0.5">Total earnings</div>
            </div>
            <div>
              <div className="text-sm font-extrabold text-ink">{talent.jobsCompleted}</div>
              <div className="text-[10px] text-ink-muted mt-0.5">Total jobs</div>
            </div>
            <div>
              <div className="text-sm font-extrabold text-ink">{talent.hoursBilled}</div>
              <div className="text-[10px] text-ink-muted mt-0.5">Total hours</div>
            </div>
          </div>

          <div className="border-t border-border pt-4">
            <h4 className="text-xs font-bold text-ink mb-1">Hours per week</h4>
            <p className="text-xs text-ink-muted">{talent.hoursPerWeek}</p>
            {talent.openToContractToHire && (
              <p className="text-xs text-primary font-semibold mt-1.5 flex items-center gap-1.5">
                Open to contract to hire
                <span className="text-[9px] font-bold uppercase text-white bg-primary px-1.5 py-0.5 rounded">New</span>
              </p>
            )}
          </div>

          <div className="border-t border-border pt-4">
            <h4 className="text-xs font-bold text-ink mb-1">Avg. response</h4>
            <p className="text-xs text-ink-muted">{talent.avgResponseHours}</p>
          </div>

          <div className="border-t border-border pt-4">
            <h4 className="text-xs font-bold text-ink mb-1">Languages</h4>
            <p className="text-xs text-ink-muted">English: {talent.englishLevel}</p>
          </div>

          <div className="border-t border-border pt-4">
            <h4 className="text-xs font-bold text-ink mb-1">Verifications</h4>
            <p className="text-xs text-ink-muted flex items-center gap-1.5">
              ID: {talent.verified ? 'Verified' : 'Not verified'}
              {talent.verified && <BadgeCheck className="w-3.5 h-3.5 text-primary" />}
            </p>
          </div>
        </Card>

        <div className="space-y-6">
          {/* About */}
          <Card padding="lg" className="space-y-3">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <h2 className="text-base font-bold text-ink max-w-xl">{talent.headline}</h2>
              <span className="text-lg font-extrabold text-ink shrink-0">₹{talent.hourlyRate}/hr</span>
            </div>
            <p className="text-xs text-ink leading-relaxed">
              {displayedBio}{' '}
              {bioIsLong && (
                <button
                  onClick={() => setBioExpanded((v) => !v)}
                  className="text-primary font-semibold hover:underline cursor-pointer"
                >
                  {bioExpanded ? 'less' : 'more'}
                </button>
              )}
            </p>
          </Card>

          {/* Work history */}
          <Card padding="lg" className="space-y-4">
            <h3 className="text-base font-bold text-ink">Work history</h3>

            {sortedInsightTags.length > 0 && (
              <div>
                <h4 className="text-xs font-bold text-ink mb-2">Insights from completed jobs</h4>
                <div className="flex flex-wrap gap-2">
                  {sortedInsightTags.map(([tag, count]) => (
                    <span
                      key={tag}
                      className="px-3 py-1.5 rounded-full bg-surface-subtle border border-border text-xs font-medium text-ink"
                    >
                      {tag} {count}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {completedJobs.length === 0 && inProgressJobs.length === 0 ? (
              <p className="text-xs text-ink-muted">No completed jobs yet.</p>
            ) : (
              <div>
                <div className="flex items-center gap-5 border-b border-border">
                  <button
                    onClick={() => setJobsTab('completed')}
                    className={`pb-2.5 text-xs font-semibold border-b-2 cursor-pointer ${
                      jobsTab === 'completed' ? 'border-primary text-primary' : 'border-transparent text-ink-muted hover:text-ink'
                    }`}
                  >
                    Completed jobs ({completedJobs.length})
                  </button>
                  <button
                    onClick={() => setJobsTab('in_progress')}
                    className={`pb-2.5 text-xs font-semibold border-b-2 cursor-pointer ${
                      jobsTab === 'in_progress' ? 'border-primary text-primary' : 'border-transparent text-ink-muted hover:text-ink'
                    }`}
                  >
                    In progress ({inProgressJobs.length})
                  </button>
                </div>

                {activeJobs.length === 0 ? (
                  <p className="text-xs text-ink-muted pt-4">
                    {jobsTab === 'completed' ? 'No completed jobs yet.' : 'No jobs currently in progress.'}
                  </p>
                ) : (
                  <div className="divide-y divide-border">
                    {activeJobs.map((job) => (
                      <div key={job.id} className="py-4 space-y-2">
                        <p className="text-sm font-semibold text-ink">{job.jobTitle}</p>
                        {job.status === 'completed' ? (
                          <div className="flex items-center gap-2 text-xs text-ink-muted">
                            <span className="flex items-center gap-1 font-semibold text-amber-600">
                              <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
                              {job.rating?.toFixed(1)}
                            </span>
                            <span>|</span>
                            <span>
                              {formatDate(job.startDate, 'short')}
                              {job.endDate && job.endDate !== job.startDate ? ` - ${formatDate(job.endDate, 'short')}` : ''}
                            </span>
                          </div>
                        ) : (
                          <p className="text-xs text-ink-muted">Started {formatDate(job.startDate, 'short')}</p>
                        )}
                        {job.review && <p className="text-xs text-ink italic">&quot;{job.review}&quot;</p>}
                        {job.tags && job.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {job.tags.map((tag) => (
                              <span
                                key={tag}
                                className="px-2.5 py-1 rounded-lg bg-bg border border-border text-[10px] font-medium text-ink-muted"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                        <div className="flex items-center justify-between text-xs pt-1">
                          <span className="font-semibold text-ink">₹{job.amount.toLocaleString('en-IN')}</span>
                          <span className="text-ink-muted">{job.priceType}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </Card>

          {/* Portfolio */}
          <Card padding="lg" className="space-y-4">
            <h3 className="text-base font-bold text-ink">Portfolio</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {visiblePortfolioItems.map((item) => (
                <div key={item.id} className="space-y-1.5">
                  <img
                    src={item.image}
                    alt={item.caption}
                    className="w-full h-32 object-cover rounded-xl border border-border"
                  />
                  <p className="text-[11px] text-ink-muted">{item.caption}</p>
                </div>
              ))}
            </div>
            {portfolioPageCount > 1 && (
              <div className="flex items-center justify-center gap-2 pt-2">
                <button
                  disabled={portfolioPage === 0}
                  onClick={() => setPortfolioPage((p) => p - 1)}
                  className="w-7 h-7 rounded-full border border-border flex items-center justify-center text-ink-muted disabled:opacity-30 cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                {Array.from({ length: portfolioPageCount }).map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setPortfolioPage(i)}
                    className={`w-6 h-6 rounded-full text-[11px] font-semibold cursor-pointer ${
                      i === portfolioPage ? 'bg-primary text-primary-foreground' : 'text-ink-muted hover:bg-surface-subtle'
                    }`}
                  >
                    {i + 1}
                  </button>
                ))}
                <button
                  disabled={portfolioPage === portfolioPageCount - 1}
                  onClick={() => setPortfolioPage((p) => p + 1)}
                  className="w-7 h-7 rounded-full border border-border flex items-center justify-center text-ink-muted disabled:opacity-30 cursor-pointer"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </Card>

          {/* Skills */}
          <Card padding="lg" className="space-y-3">
            <h3 className="text-base font-bold text-ink">Skills</h3>
            <div className="flex flex-wrap gap-2">
              {talent.skills.map((skill) => (
                <span
                  key={skill}
                  className="px-3 py-1.5 rounded-xl bg-surface-subtle text-xs font-medium text-ink border border-border"
                >
                  {skill}
                </span>
              ))}
            </div>
          </Card>

          {/* Project catalog */}
          {projectCatalog.length > 0 && (
            <Card padding="lg" className="space-y-2">
              <div>
                <h3 className="text-base font-bold text-ink">Project catalog</h3>
                <p className="text-xs text-ink-muted mt-0.5">
                  Get started working with {talent.name.split(' ')[0]} quickly with these predefined projects.
                </p>
              </div>
              <div className="divide-y divide-border">
                {projectCatalog.map((project) => (
                  <div key={project.id} className="py-4 flex items-start gap-4">
                    <img
                      src={project.image}
                      alt={project.title}
                      className="w-20 h-16 object-cover rounded-lg border border-border shrink-0"
                    />
                    <div className="flex-1 space-y-2">
                      <p className="text-xs font-semibold text-ink">{project.title}</p>
                      <div className="flex items-center gap-3 text-[11px] text-ink-muted">
                        <span className="px-2 py-0.5 rounded bg-bg border border-border font-semibold text-ink">
                          From ₹{project.priceFrom.toLocaleString('en-IN')}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {project.deliveryDays} day{project.deliveryDays === 1 ? '' : 's'} delivery
                        </span>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-full"
                        onClick={() => showToast("Viewing project packages isn't wired up yet — Marché is still a frontend preview.")}
                      >
                        View project
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>

      {/* Testimonials — full width */}
      {testimonials.length > 0 && (
        <Card padding="lg" className="space-y-2">
          <div>
            <h3 className="text-base font-bold text-ink">Testimonials</h3>
            <p className="text-xs text-ink-muted mt-0.5">Endorsements from past clients</p>
          </div>
          <div className="divide-y divide-border">
            {testimonials.map((t) => (
              <div key={t.id} className="py-4 space-y-3">
                <p className="text-xs text-ink italic leading-relaxed">&quot;{t.quote}&quot;</p>
                <div className="flex items-center gap-3">
                  <span className="w-9 h-9 rounded-full bg-surface-subtle border border-border flex items-center justify-center text-ink-muted shrink-0">
                    <UserIcon className="w-4 h-4" />
                  </span>
                  <div className="text-xs">
                    <p className="font-semibold text-ink">
                      {t.authorName} <span className="font-normal text-ink-muted">| {t.authorTitle}</span>
                    </p>
                    <p className="text-ink-muted flex items-center gap-1.5 mt-0.5">
                      {t.company} • {formatDate(t.date, 'short')}
                      {t.verified && (
                        <span className="flex items-center gap-1 text-primary font-medium">
                          <BadgeCheck className="w-3 h-3" />
                          Verified
                        </span>
                      )}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Employment history — full width */}
      {employmentHistory.length > 0 && (
        <Card padding="lg" className="space-y-2">
          <h3 className="text-base font-bold text-ink">Employment history</h3>
          <div className="divide-y divide-border">
            {employmentHistory.map((e) => (
              <div key={e.id} className="py-3">
                <p className="text-xs font-semibold text-ink">{e.title}</p>
                <p className="text-[11px] text-ink-muted mt-0.5">
                  {e.company} • {formatMonthYear(e.startDate)} – {e.endDate ? formatMonthYear(e.endDate) : 'Present'}
                </p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Education — full width */}
      {talent.education && talent.education.length > 0 && (
        <Card padding="lg" className="space-y-2">
          <h3 className="text-base font-bold text-ink">Education</h3>
          <div className="divide-y divide-border">
            {talent.education.map((edu, idx) => (
              <div key={idx} className="py-3">
                <p className="text-xs font-semibold text-ink">{edu.school}</p>
                {edu.degree && <p className="text-[11px] text-ink-muted mt-0.5">{edu.degree}</p>}
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
};
