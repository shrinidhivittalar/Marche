import React, { useEffect, useRef, useState } from 'react';
import { animate, stagger } from 'animejs';
import {
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Calendar,
  Users,
  Search,
  Lock,
  LogIn,
  Camera,
  Utensils,
  Music,
  Building2,
  ClipboardList,
  Flower2,
  UserPlus,
  MessageSquare,
  CheckCircle,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Button } from '@marche/ui';
import { formatBudget } from '../lib/formatBudget';
import { useApiResource } from '../hooks/useApiResource';
import { marketplaceApi } from '../lib/marketplace-api';
import { HeroCanvas } from '../components/landing/HeroCanvas';

// Best-effort icon per category slug — falls back to Sparkles for anything
// not seeded yet, since the category list itself is real (fetched from the
// API), just its iconography isn't part of that API response.
const CATEGORY_ICONS: Record<string, React.ElementType> = {
  photography: Camera,
  'photography-video': Camera,
  catering: Utensils,
  entertainment: Music,
  venue: Building2,
  venues: Building2,
  planning: ClipboardList,
  decoration: Flower2,
  decor: Flower2,
};

// Cycled by index so each category card gets a distinct accent instead of
// every card repeating the same brand red — full literal class names
// (Tailwind's JIT scan needs the exact string in source, not a composed one).
const CATEGORY_ACCENTS = [
  {
    icon: 'from-red-600 to-orange-500',
    glow: 'shadow-[0_0_20px_-4px_rgba(239,68,68,0.6)]',
    bar: 'from-red-500 to-orange-400',
    wash: 'bg-red-500',
  },
  {
    icon: 'from-orange-600 to-amber-500',
    glow: 'shadow-[0_0_20px_-4px_rgba(249,115,22,0.6)]',
    bar: 'from-orange-500 to-amber-400',
    wash: 'bg-orange-500',
  },
  {
    icon: 'from-fuchsia-600 to-purple-500',
    glow: 'shadow-[0_0_20px_-4px_rgba(217,70,239,0.6)]',
    bar: 'from-fuchsia-500 to-purple-400',
    wash: 'bg-fuchsia-500',
  },
  {
    icon: 'from-rose-600 to-pink-500',
    glow: 'shadow-[0_0_20px_-4px_rgba(244,63,94,0.6)]',
    bar: 'from-rose-500 to-pink-400',
    wash: 'bg-rose-500',
  },
  {
    icon: 'from-cyan-600 to-teal-500',
    glow: 'shadow-[0_0_20px_-4px_rgba(6,182,212,0.6)]',
    bar: 'from-cyan-500 to-teal-400',
    wash: 'bg-cyan-500',
  },
  {
    icon: 'from-amber-600 to-orange-500',
    glow: 'shadow-[0_0_20px_-4px_rgba(245,158,11,0.6)]',
    bar: 'from-amber-500 to-orange-400',
    wash: 'bg-amber-500',
  },
];

const HOW_IT_WORKS = [
  {
    icon: UserPlus,
    title: 'Create Your Profile',
    body: 'Sign up and set up your profile to showcase your skills or event needs.',
  },
  {
    icon: Search,
    title: 'Find or Post',
    body: 'Search for the right talent, or post a job and let qualified people find you.',
  },
  {
    icon: MessageSquare,
    title: 'Connect & Collaborate',
    body: 'Message directly, share the brief, and work out the details before you commit.',
  },
  {
    icon: CheckCircle,
    title: 'Hire & Celebrate',
    body: 'Hire with a binding contract and deliver the event with confidence.',
  },
];

export const LandingPage: React.FC = () => {
  const { navigate, jobs } = useApp();
  const [loginPrompt, setLoginPrompt] = useState<string | null>(null);
  const jobsGridRef = useRef<HTMLDivElement>(null);
  const categoriesGridRef = useRef<HTMLDivElement>(null);

  // Real categories from the marketplace — no invented job counts per
  // category, since the API doesn't return them and making numbers up would
  // be exactly the kind of fake trust signal this rewrite is deliberately
  // avoiding (see the skipped "trusted by" logo strip below).
  const categories = useApiResource(() => marketplaceApi.categories(), []);
  const topCategories = (categories.data ?? []).filter((c) => !c.parentId).slice(0, 6);

  const promptLogin = (message: string) => {
    setLoginPrompt(message);
    setTimeout(() => navigate('/auth/signin'), 1400);
  };

  // Hero entrance, once on mount. `prefers-reduced-motion` gets the end
  // state immediately rather than no animation at all — the elements start
  // at opacity-0 in the markup, so skipping the animate() call entirely
  // would leave them invisible forever, not just unanimated.
  useEffect(() => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const duration = reduceMotion ? 0 : 700;
    animate('.lp-badge', { opacity: [0, 1], translateY: [12, 0], duration, ease: 'outQuad' });
    animate('.lp-headline', {
      opacity: [0, 1],
      translateY: [24, 0],
      duration,
      delay: reduceMotion ? 0 : 120,
      ease: 'outQuad',
    });
    animate('.lp-subhead', {
      opacity: [0, 1],
      translateY: [16, 0],
      duration,
      delay: reduceMotion ? 0 : 260,
      ease: 'outQuad',
    });
    animate('.lp-cta', {
      opacity: [0, 1],
      translateY: [16, 0],
      duration,
      delay: reduceMotion ? 0 : stagger(90, { start: 360 }),
      ease: 'outQuad',
    });
    animate('.lp-hero-image', {
      opacity: [0, 1],
      translateX: [24, 0],
      duration,
      delay: reduceMotion ? 0 : 300,
      ease: 'outQuad',
    });
    animate('.lp-trust-card', {
      opacity: [0, 1],
      translateY: [16, 0],
      duration,
      delay: reduceMotion ? 0 : stagger(80, { start: 520 }),
      ease: 'outQuad',
    });
  }, []);

  // Category cards and job cards both reveal on scroll rather than on
  // mount — both sit below the fold.
  useEffect(() => {
    const grid = categoriesGridRef.current;
    if (!grid || topCategories.length === 0) return;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        animate('.lp-category-card', {
          opacity: [0, 1],
          translateY: [20, 0],
          duration: reduceMotion ? 0 : 600,
          delay: reduceMotion ? 0 : stagger(70),
          ease: 'outQuad',
        });
        observer.disconnect();
      },
      { threshold: 0.2 },
    );
    observer.observe(grid);
    return () => observer.disconnect();
  }, [topCategories.length]);

  useEffect(() => {
    const grid = jobsGridRef.current;
    if (!grid || jobs.length === 0) return;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        animate('.lp-job-card', {
          opacity: [0, 1],
          translateY: [20, 0],
          duration: reduceMotion ? 0 : 600,
          delay: reduceMotion ? 0 : stagger(100),
          ease: 'outQuad',
        });
        observer.disconnect();
      },
      { threshold: 0.2 },
    );
    observer.observe(grid);
    return () => observer.disconnect();
  }, [jobs.length]);

  return (
    <div className="min-h-screen bg-inverse text-inverse-fg">
      {loginPrompt && (
        <div className="fixed bottom-6 right-6 z-50 bg-primary text-primary-foreground px-4 py-3 rounded-2xl shadow-xl flex items-center gap-3 animate-in fade-in slide-in-from-bottom-5 duration-200 text-xs font-medium">
          <LogIn className="w-4 h-4 shrink-0" />
          {loginPrompt}
        </div>
      )}

      {/* Top Header */}
      <header className="border-b border-white/10 bg-inverse/90 backdrop-blur sticky top-0 z-30 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-primary text-primary-foreground flex items-center justify-center font-bold text-lg shadow-xs">
              M
            </div>
            <span className="text-xl font-bold tracking-tight text-inverse-fg">MARCHÉ</span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/auth/signin')}
              className="text-xs font-semibold text-zinc-400 hover:text-white px-3 py-1.5 transition-colors cursor-pointer"
            >
              Sign In
            </button>
            <Button size="sm" onClick={() => navigate('/auth/signup')}>
              Sign Up
            </Button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative px-6 pt-20 pb-10 lg:pt-24 max-w-7xl mx-auto overflow-hidden">
        <HeroCanvas />
        <div className="relative">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">
            <div className="text-center lg:text-left">
              <div className="lp-badge opacity-0 inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs font-semibold text-accent mb-8">
                <Sparkles className="w-3.5 h-3.5" />
                <span>The Next-Generation Event Talent Marketplace</span>
              </div>

              <h1 className="lp-headline opacity-0 text-4xl md:text-6xl tracking-tight text-inverse-fg leading-[1.1] mb-6">
                Extraordinary events.
                <br />
                <span className="text-primary-hover">Exceptional talent.</span>
              </h1>

              <p className="lp-subhead opacity-0 text-lg md:text-xl text-zinc-400 max-w-2xl mx-auto lg:mx-0 mb-10 leading-relaxed font-normal">
                Post event jobs, receive direct proposals from verified creators, and hire with a
                confirmed, binding contract.
              </p>

              {/* Dual Role Quick Actions */}
              <div className="flex flex-col sm:flex-row items-center lg:items-start justify-center lg:justify-start gap-4 max-w-md mx-auto lg:mx-0">
                <Button
                  size="lg"
                  className="lp-cta opacity-0 w-full sm:w-auto"
                  icon={ArrowRight}
                  iconPosition="right"
                  onClick={() => promptLogin('Sign in to post a job and start hiring talent.')}
                >
                  Post a Job
                </Button>

                <Button
                  size="lg"
                  variant="outline"
                  className="lp-cta opacity-0 w-full sm:w-auto !bg-transparent !border-white/20 !text-inverse-fg hover:!bg-white/5"
                  icon={Search}
                  onClick={() => promptLogin('Sign in to browse jobs and submit proposals.')}
                >
                  Explore Jobs
                </Button>
              </div>
            </div>

            <div className="lp-hero-image opacity-0 hidden lg:block">
              <img
                src="/images/hero-showcase.png"
                alt="Live concert, corporate conference, and luxury wedding events booked through Marché"
                className="w-full h-auto"
              />
            </div>
          </div>

          {/* Trust Badges Bar */}
          <div className="mt-16 pt-8 border-t border-white/10 grid grid-cols-2 md:grid-cols-4 gap-6 text-left">
            {[
              {
                icon: Lock,
                title: 'Confirmed Bookings',
                body: 'Every hire is instantly locked in with a binding contract.',
              },
              {
                icon: Users,
                title: 'Verified Talent',
                body: 'Top photographers, caterers, DJs & venue pros, all verified for you.',
              },
              {
                icon: Calendar,
                title: 'Slot Availability',
                body: 'Morning, afternoon, or evening slots — book the perfect time.',
              },
              {
                icon: ShieldCheck,
                title: 'State Machine Audit',
                body: '100% traceable, tamper-proof state transitions for complete trust.',
              },
            ].map((badge, idx) => (
              <div
                key={badge.title}
                className="lp-trust-card opacity-0 relative overflow-hidden p-6 bg-white/5 border border-white/10 rounded-2xl"
              >
                <span
                  className="absolute bottom-3 right-3 w-10 h-10 opacity-[0.15]"
                  style={{
                    backgroundImage: 'radial-gradient(currentColor 1px, transparent 1px)',
                    backgroundSize: '6px 6px',
                    color: 'white',
                  }}
                />
                <span className="absolute top-4 right-5 text-4xl font-black text-white/5 select-none">
                  {String(idx + 1).padStart(2, '0')}
                </span>
                <span className="relative w-12 h-12 rounded-xl bg-gradient-to-br from-red-600 to-orange-500 shadow-[0_0_20px_-4px_rgba(239,68,68,0.6)] text-white flex items-center justify-center mb-4">
                  <badge.icon className="w-5 h-5" />
                </span>
                <h4 className="relative text-sm font-semibold text-inverse-fg">{badge.title}</h4>
                <p className="relative text-[11px] text-zinc-400 mt-1.5 leading-relaxed">
                  {badge.body}
                </p>
                <span className="block w-8 h-0.5 bg-primary mt-4" />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Explore Categories — real categories from the API, not a fixed
          marketing list, so this never drifts out of sync with what the
          marketplace actually offers. */}
      {topCategories.length > 0 && (
        <section className="px-6 py-16 border-t border-white/10">
          <div className="max-w-7xl mx-auto">
            <div className="flex items-end justify-between mb-8">
              <h2 className="text-2xl md:text-3xl font-bold text-inverse-fg">
                Explore <span className="text-primary-hover">Top</span> Categories
              </h2>
              <button
                onClick={() => promptLogin('Sign in to browse jobs and submit proposals.')}
                className="hidden sm:flex items-center gap-1 text-xs font-semibold text-primary-hover hover:underline cursor-pointer shrink-0"
              >
                View all categories <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div
              ref={categoriesGridRef}
              className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4"
            >
              {topCategories.map((cat, idx) => {
                const Icon = CATEGORY_ICONS[cat.slug] ?? Sparkles;
                const accent = CATEGORY_ACCENTS[idx % CATEGORY_ACCENTS.length]!;
                return (
                  <button
                    key={cat.id}
                    onClick={() => promptLogin('Sign in to browse jobs and submit proposals.')}
                    className="lp-category-card opacity-0 relative overflow-hidden flex flex-col items-start gap-3 p-5 pb-6 bg-white/5 border border-white/10 rounded-2xl hover:border-primary/40 hover:bg-white/[0.07] transition-all cursor-pointer text-left"
                  >
                    <span
                      className={`absolute -bottom-8 left-1/2 -translate-x-1/2 w-32 h-16 rounded-full blur-2xl opacity-20 pointer-events-none ${accent.wash}`}
                    />
                    <span
                      className="absolute bottom-3 right-3 w-10 h-10 opacity-[0.15]"
                      style={{
                        backgroundImage: 'radial-gradient(currentColor 1px, transparent 1px)',
                        backgroundSize: '6px 6px',
                        color: 'white',
                      }}
                    />
                    <span
                      className={`relative w-11 h-11 rounded-xl bg-gradient-to-br ${accent.icon} ${accent.glow} text-white flex items-center justify-center`}
                    >
                      <Icon className="w-5 h-5" />
                    </span>
                    <span className="relative text-xs font-semibold text-inverse-fg">
                      {cat.name}
                    </span>

                    <div className="relative w-full flex items-end justify-between mt-2">
                      <span className="text-2xl font-black text-white/5 select-none">
                        {String(idx + 1).padStart(2, '0')}
                      </span>
                      <span className="w-7 h-7 rounded-full bg-white/10 text-inverse-fg flex items-center justify-center shrink-0">
                        <ArrowRight className="w-3.5 h-3.5" />
                      </span>
                    </div>

                    <span
                      className={`absolute bottom-0 left-0 right-0 h-[3px] bg-gradient-to-r ${accent.bar}`}
                    />
                  </button>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* How It Works */}
      <section className="px-6 py-16 border-t border-white/10">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-bold text-inverse-fg mb-10">
            How It <span className="text-primary-hover">Works</span>
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {HOW_IT_WORKS.map((step, idx) => (
              <div key={step.title} className="relative">
                <span className="text-[11px] font-mono text-zinc-500">0{idx + 1}</span>
                <div className="w-11 h-11 rounded-xl bg-white/5 border border-white/10 text-primary-hover flex items-center justify-center mt-2 mb-3">
                  <step.icon className="w-5 h-5" />
                </div>
                <h3 className="text-sm font-bold text-inverse-fg mb-1">{step.title}</h3>
                <p className="text-xs text-zinc-400 leading-relaxed">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Featured Live Jobs Ticker / Grid */}
      <section className="px-6 py-16 bg-white/[0.03] border-y border-white/10">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 gap-4">
            <div>
              <span className="text-xs font-mono uppercase font-bold text-primary-hover tracking-wider">
                Live Marketplace
              </span>
              <h2 className="text-2xl md:text-3xl font-bold text-inverse-fg mt-1">
                Recent Open Jobs
              </h2>
            </div>
            <Button
              variant="outline"
              size="sm"
              icon={ArrowRight}
              iconPosition="right"
              className="!bg-transparent !border-white/20 !text-inverse-fg hover:!bg-white/5"
              onClick={() => promptLogin('Sign in to browse jobs and submit proposals.')}
            >
              View All Jobs
            </Button>
          </div>

          <div ref={jobsGridRef} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {jobs.slice(0, 3).map((req) => (
              <div
                key={req.id}
                onClick={() => promptLogin('Sign in to view this job and submit a proposal.')}
                className="lp-job-card opacity-0 bg-white/5 border border-white/10 rounded-2xl p-6 hover:border-primary/40 hover:bg-white/[0.07] transition-all cursor-pointer flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between text-xs text-zinc-400 mb-3">
                    <span className="px-2.5 py-0.5 rounded-full bg-white/5 text-inverse-fg font-medium border border-white/10">
                      {req.category}
                    </span>
                    <span className="font-mono text-primary-hover font-bold">
                      {formatBudget(req)}
                    </span>
                  </div>

                  <h3 className="text-base font-bold text-inverse-fg line-clamp-2 mb-2 leading-snug">
                    {req.title}
                  </h3>

                  <p className="text-xs text-zinc-400 line-clamp-3 mb-4 leading-relaxed">
                    {req.description}
                  </p>
                </div>

                <div className="pt-4 border-t border-white/10 flex items-center justify-between text-xs text-zinc-400">
                  <span>{req.location}</span>
                  <span className="font-medium text-inverse-fg">
                    {req.proposalsCount} proposals
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/10 px-6 py-8">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-zinc-400">
          <div className="flex items-center gap-2">
            <span className="font-bold text-inverse-fg">MARCHÉ</span>
            <span>© 2026 Marché Marketplace Inc. All rights reserved.</span>
          </div>
          <div className="flex items-center gap-6">
            <button onClick={() => navigate('/landing')} className="hover:text-white">
              Privacy Policy
            </button>
            <button onClick={() => navigate('/landing')} className="hover:text-white">
              Terms of Service
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
};
