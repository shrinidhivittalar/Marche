import React from 'react';
import { Award, Users2, TrendingUp, Zap } from 'lucide-react';
import { Card, Skeleton } from '@marche/ui';
import { useApp } from '../../context/AppContext';
import { useApiResource } from '../../hooks/useApiResource';
import { proposalsApi } from '../../lib/proposals-api';
import { paymentsApi } from '../../lib/payments-api';
import { profilesApi } from '../../lib/marketplace-api';
import { reviewsApi } from '../../lib/reviews-api';

const CATEGORY_COLORS = [
  'bg-primary',
  'bg-sky-500',
  'bg-amber-500',
  'bg-rose-400',
  'bg-violet-500',
  'bg-emerald-500',
];

export const StatsPage: React.FC = () => {
  const { accessToken } = useApp();
  const token = accessToken;

  const profile = useApiResource(() => profilesApi.me(token as string), [token], {
    enabled: Boolean(token),
  });
  const reviewStats = useApiResource(
    () => reviewsApi.statsForProfile(profile.data?.id as string),
    [profile.data?.id],
    { enabled: Boolean(profile.data?.id) },
  );
  const proposals = useApiResource(() => proposalsApi.mine(token as string, 1, 100), [token], {
    enabled: Boolean(token),
  });
  const payments = useApiResource(() => paymentsApi.mine(token as string, 1, 100), [token], {
    enabled: Boolean(token),
  });

  const loading = profile.loading || proposals.loading || payments.loading;

  // Every row here was actually submitted — unlike the old mock model, the
  // backend has no draft concept for proposals, so no draft filter is needed.
  const myProposals = proposals.data?.items ?? [];
  const hiredCount = myProposals.filter((p) => p.status === 'ACCEPTED').length;
  const declinedCount = myProposals.filter((p) => p.status === 'REJECTED').length;
  const winRate = myProposals.length > 0 ? Math.round((hiredCount / myProposals.length) * 100) : 0;

  const funnelStages = [
    { label: 'Submitted', count: myProposals.length, color: 'bg-primary' },
    { label: 'Hired', count: hiredCount, color: 'bg-emerald-500' },
    { label: 'Declined', count: declinedCount, color: 'bg-rose-400' },
  ];
  const funnelMax = Math.max(...funnelStages.map((s) => s.count), 1);

  const paidPayments = (payments.data?.items ?? []).filter((p) => p.status === 'PAID');
  const totalEarnings = paidPayments.reduce((sum, p) => sum + Number(p.amount), 0);

  // Contracts by category — proposals don't carry the requirement's category
  // in the provider's own view (OWN_PROPOSAL_FIELDS deliberately omits it),
  // but a paid payment's connection does, so this counts paid contracts
  // rather than submitted proposals. Renamed from "Proposals by Category"
  // to match what the data actually shows.
  const categoryCounts = paidPayments.reduce<Record<string, number>>((acc, p) => {
    const name = p.connection.job.category.name;
    acc[name] = (acc[name] ?? 0) + 1;
    return acc;
  }, {});
  const categoryEntries = Object.entries(categoryCounts).sort((a, b) => b[1] - a[1]);
  const categoryMax = Math.max(...categoryEntries.map(([, count]) => count), 1);

  const monthlyMap = new Map<string, { label: string; amount: number }>();
  paidPayments.forEach((p) => {
    const d = new Date(p.paidAt ?? p.createdAt);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
    const existing = monthlyMap.get(key);
    monthlyMap.set(key, { label, amount: (existing?.amount ?? 0) + Number(p.amount) });
  });
  const monthlyEntries = Array.from(monthlyMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, v]) => v);
  const monthlyMax = Math.max(...monthlyEntries.map((m) => m.amount), 1);

  const averageRating = reviewStats.data?.averageRating ?? null;
  const reviewCount = reviewStats.data?.reviewCount ?? 0;

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="pb-6 border-b border-border">
        <h1 className="text-2xl md:text-3xl font-extrabold text-ink tracking-tight">My Stats</h1>
        <p className="text-xs text-ink-muted mt-1">
          View your proposal history, earnings, and category performance.
        </p>
      </div>

      {/* Top Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-5">
          <span className="text-xs font-medium text-ink-muted">Win Rate</span>
          {loading ? (
            <Skeleton className="h-6 w-16 mt-1" />
          ) : (
            <>
              <p className="text-2xl font-bold text-ink mt-1">{winRate}%</p>
              <p className="text-[11px] text-ink-muted mt-1">
                {hiredCount} of {myProposals.length} proposals hired
              </p>
            </>
          )}
        </Card>

        <Card className="p-5">
          <span className="text-xs font-medium text-ink-muted">Total Earnings</span>
          {loading ? (
            <Skeleton className="h-6 w-24 mt-1" />
          ) : (
            <>
              <p className="text-2xl font-bold text-ink mt-1">
                ₹{totalEarnings.toLocaleString('en-IN')}
              </p>
              <p className="text-[11px] text-ink-muted mt-1">
                Across {paidPayments.length} contract{paidPayments.length === 1 ? '' : 's'}
              </p>
            </>
          )}
        </Card>

        <Card className="p-5">
          <span className="text-xs font-medium text-ink-muted">Client Rating</span>
          {reviewStats.loading ? (
            <Skeleton className="h-6 w-12 mt-1" />
          ) : (
            <>
              <p className="text-2xl font-bold text-ink mt-1">
                {averageRating !== null ? averageRating.toFixed(2) : '—'}
              </p>
              <p className="text-[11px] text-ink-muted mt-1">
                {reviewCount > 0
                  ? `Based on ${reviewCount} review${reviewCount === 1 ? '' : 's'}`
                  : 'No reviews yet'}
              </p>
            </>
          )}
        </Card>
      </div>

      {/* Proposals Funnel */}
      <Card className="p-6 space-y-4">
        <div>
          <h2 className="text-sm font-bold text-ink">Proposals Funnel</h2>
          <p className="text-xs text-ink-muted mt-0.5">
            Track how many of your proposals convert into contracts.
          </p>
        </div>

        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-4 w-full" />
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {funnelStages.map(({ label, count, color }) => (
              <div key={label} className="flex items-center gap-3">
                <span className="w-20 text-xs font-medium text-ink-muted shrink-0">{label}</span>
                <div className="flex-1 h-2 rounded-full bg-bg overflow-hidden">
                  <div
                    className={`h-full ${color} rounded-full transition-all`}
                    style={{ width: `${(count / funnelMax) * 100}%` }}
                  />
                </div>
                <span className="w-8 text-right text-xs font-bold text-ink shrink-0">{count}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Category Breakdown + Earnings by Month */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-6 space-y-4">
          <h2 className="text-sm font-bold text-ink">Contracts by Category</h2>
          {loading ? (
            <Skeleton className="h-20 w-full" />
          ) : categoryEntries.length === 0 ? (
            <p className="text-xs text-ink-muted">
              Complete a paid contract to see your category breakdown.
            </p>
          ) : (
            <div className="space-y-3">
              {categoryEntries.map(([category, count], idx) => (
                <div key={category} className="flex items-center gap-3">
                  <span className="w-24 text-xs font-medium text-ink-muted shrink-0 truncate">
                    {category}
                  </span>
                  <div className="flex-1 h-2 rounded-full bg-bg overflow-hidden">
                    <div
                      className={`h-full ${CATEGORY_COLORS[idx % CATEGORY_COLORS.length]} rounded-full`}
                      style={{ width: `${(count / categoryMax) * 100}%` }}
                    />
                  </div>
                  <span className="w-6 text-right text-xs font-bold text-ink shrink-0">
                    {count}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-6 space-y-4">
          <h2 className="text-sm font-bold text-ink">Earnings by Month</h2>
          {loading ? (
            <Skeleton className="h-20 w-full" />
          ) : monthlyEntries.length === 0 ? (
            <p className="text-xs text-ink-muted">
              Get paid on a contract to start tracking monthly earnings.
            </p>
          ) : (
            <div className="space-y-3">
              {monthlyEntries.map((m) => (
                <div key={m.label} className="flex items-center gap-3">
                  <span className="w-14 text-xs font-medium text-ink-muted shrink-0">
                    {m.label}
                  </span>
                  <div className="flex-1 h-2 rounded-full bg-bg overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full"
                      style={{ width: `${(m.amount / monthlyMax) * 100}%` }}
                    />
                  </div>
                  <span className="w-16 text-right text-xs font-bold text-ink shrink-0">
                    ₹{m.amount.toLocaleString('en-IN')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Additional insights */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="p-6 space-y-2">
          <h3 className="text-sm font-bold text-ink flex items-center gap-1.5">
            <Award className="w-4 h-4" /> Job Success Score
          </h3>
          <p className="text-xs text-ink-muted">
            Leverage Job Success insights to help you learn how to earn or regain a score.
          </p>
        </Card>

        <Card className="p-6 space-y-2">
          <h3 className="text-sm font-bold text-ink flex items-center gap-1.5">
            <Users2 className="w-4 h-4" /> Client Relationships
          </h3>
          <p className="text-xs text-ink-muted">
            Client relationships longer than 90 days can positively impact your reputation.
          </p>
        </Card>

        <Card className="p-6 space-y-2">
          <h3 className="text-sm font-bold text-ink flex items-center gap-1.5">
            <TrendingUp className="w-4 h-4" /> Profile Metrics
          </h3>
          <p className="text-xs text-ink-muted">
            Profile views, invites, and impressions over time.
          </p>
        </Card>

        <Card className="p-6 space-y-2">
          <h3 className="text-sm font-bold text-ink flex items-center gap-1.5">
            <Zap className="w-4 h-4" /> Connects &amp; Rising Talent
          </h3>
          <p className="text-xs text-ink-muted">Bidding credits and talent-recognition programs.</p>
        </Card>
      </div>
    </div>
  );
};
