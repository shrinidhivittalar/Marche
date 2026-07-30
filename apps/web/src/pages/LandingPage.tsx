import React from 'react';
import {
  Sparkles,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  Calendar,
  Clock,
  Briefcase,
  Users,
  Search,
  Lock,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Button } from '@marche/ui';

export const LandingPage: React.FC = () => {
  const { navigate, setCurrentUserRole, jobs } = useApp();

  return (
    <div className="min-h-screen bg-bg text-ink">
      {/* Top Header */}
      <header className="border-b border-border bg-white sticky top-0 z-30 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-primary text-white flex items-center justify-center font-bold text-lg shadow-xs">
              M
            </div>
            <span className="text-xl font-bold tracking-tight text-ink">MARCHÉ</span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/auth/signin')}
              className="text-xs font-semibold text-ink-muted hover:text-ink px-3 py-1.5 transition-colors cursor-pointer"
            >
              Sign In
            </button>
            <Button
              size="sm"
              onClick={() => navigate('/auth/signup')}
            >
              Sign Up
            </Button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="px-6 py-20 max-w-5xl mx-auto text-center">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white border border-border text-xs font-semibold text-primary mb-8 shadow-xs">
          <Sparkles className="w-3.5 h-3.5" />
          <span>The Next-Generation Event Talent Marketplace</span>
        </div>

        <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight text-ink leading-[1.1] mb-6">
          Where extraordinary events meet <br className="hidden md:block" />
          world-class talent.
        </h1>

        <p className="text-lg md:text-xl text-ink-muted max-w-2xl mx-auto mb-10 leading-relaxed font-normal">
          Post event jobs, receive direct proposals from verified creators, and hire with total security through simulated escrow protection.
        </p>

        {/* Dual Role Quick Actions */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 max-w-md mx-auto mb-16">
          <Button
            size="lg"
            className="w-full sm:w-auto"
            icon={ArrowRight}
            iconPosition="right"
            onClick={() => {
              setCurrentUserRole('client');
              navigate('/client/jobs/new');
            }}
          >
            Post a Job
          </Button>

          <Button
            size="lg"
            variant="outline"
            className="w-full sm:w-auto"
            icon={Search}
            onClick={() => {
              setCurrentUserRole('vendor');
              navigate('/provider/dashboard');
            }}
          >
            Explore Jobs
          </Button>
        </div>

        {/* Trust Badges Bar */}
        <div className="pt-8 border-t border-border grid grid-cols-2 md:grid-cols-4 gap-6 text-left">
          <div className="p-4 bg-white border border-border rounded-2xl shadow-xs">
            <Lock className="w-5 h-5 text-primary mb-2" />
            <h4 className="text-xs font-semibold text-ink">Simulated Escrow</h4>
            <p className="text-[11px] text-ink-muted mt-0.5">Funds held safely until event completion.</p>
          </div>
          <div className="p-4 bg-white border border-border rounded-2xl shadow-xs">
            <Users className="w-5 h-5 text-primary mb-2" />
            <h4 className="text-xs font-semibold text-ink">Verified Talent</h4>
            <p className="text-[11px] text-ink-muted mt-0.5">Top photographers, caterers, DJs & venue pros.</p>
          </div>
          <div className="p-4 bg-white border border-border rounded-2xl shadow-xs">
            <Calendar className="w-5 h-5 text-primary mb-2" />
            <h4 className="text-xs font-semibold text-ink">Slot Availability</h4>
            <p className="text-[11px] text-ink-muted mt-0.5">Morning, afternoon, or evening date locks.</p>
          </div>
          <div className="p-4 bg-white border border-border rounded-2xl shadow-xs">
            <ShieldCheck className="w-5 h-5 text-primary mb-2" />
            <h4 className="text-xs font-semibold text-ink">State Machine Audit</h4>
            <p className="text-[11px] text-ink-muted mt-0.5">100% traceable, tamper-proof state transitions.</p>
          </div>
        </div>
      </section>

      {/* Featured Live Jobs Ticker / Grid */}
      <section className="px-6 py-16 bg-surface-subtle border-y border-border">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 gap-4">
            <div>
              <span className="text-xs font-mono uppercase font-bold text-primary tracking-wider">
                Live Marketplace
              </span>
              <h2 className="text-2xl md:text-3xl font-bold text-ink mt-1">
                Recent Open Jobs
              </h2>
            </div>
            <Button
              variant="outline"
              size="sm"
              icon={ArrowRight}
              iconPosition="right"
              onClick={() => {
                setCurrentUserRole('vendor');
                navigate('/provider/dashboard');
              }}
            >
              View All Jobs
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {jobs.slice(0, 3).map((req) => (
              <div
                key={req.id}
                onClick={() => {
                  setCurrentUserRole('vendor');
                  navigate(`/provider/jobs/${req.id}`);
                }}
                className="bg-white border border-border rounded-2xl p-6 hover:border-zinc-300 hover:shadow-md transition-all cursor-pointer flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between text-xs text-ink-muted mb-3">
                    <span className="px-2.5 py-0.5 rounded-full bg-surface-subtle text-ink font-medium border border-border">
                      {req.category}
                    </span>
                    <span className="font-mono text-primary font-bold">
                      ${req.budgetMin.toLocaleString()} - ${req.budgetMax.toLocaleString()}
                    </span>
                  </div>

                  <h3 className="text-base font-bold text-ink line-clamp-2 mb-2 leading-snug">
                    {req.title}
                  </h3>

                  <p className="text-xs text-ink-muted line-clamp-3 mb-4 leading-relaxed">
                    {req.description}
                  </p>
                </div>

                <div className="pt-4 border-t border-border flex items-center justify-between text-xs text-ink-muted">
                  <span>{req.location}</span>
                  <span className="font-medium text-ink">{req.proposalsCount} proposals</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border bg-white px-6 py-8">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-ink-muted">
          <div className="flex items-center gap-2">
            <span className="font-bold text-ink">MARCHÉ</span>
            <span>© 2026 Marché Marketplace Inc. All rights reserved.</span>
          </div>
          <div className="flex items-center gap-6">
            <button onClick={() => navigate('/landing')} className="hover:text-ink">
              Privacy Policy
            </button>
            <button onClick={() => navigate('/landing')} className="hover:text-ink">
              Terms of Escrow
            </button>
            <button
              onClick={() => {
                setCurrentUserRole('admin');
                navigate('/admin/audit');
              }}
              className="text-primary font-medium hover:underline"
            >
              Admin Audit Console
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
};
