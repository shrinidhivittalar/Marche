import React, { useState } from 'react';
import { ChevronRight, NotebookPen } from 'lucide-react';
import { Skeleton } from '@marche/ui';
import { EmptyState } from '../../components/common/EmptyState';
import { StatusBadge } from '../../components/common/StatusBadge';
import { useApp } from '../../context/AppContext';
import { useApiResource } from '../../hooks/useApiResource';
import { connectionsApi } from '../../lib/proposals-api';
import { paymentsApi } from '../../lib/payments-api';
import { workDiaryApi } from '../../lib/work-diary-api';

type ContractsTab = 'active' | 'all' | 'diary' | 'direct';

// All four tabs are real now. Active/All/Direct read the same Connection
// rows MyWorkPage's Contracts tab does — Direct Contracts just filters on
// job.isDirect, the flag DirectContractsService sets. Work Diary reads the
// aggregate work-diary/me endpoint, the same one ContractDetailPage's
// per-connection card and /client/work-diaries both use.
export const ContractsPage: React.FC = () => {
  const { accessToken, navigate } = useApp();
  const token = accessToken;
  const [activeTab, setActiveTab] = useState<ContractsTab>('active');

  const connections = useApiResource(() => connectionsApi.mine(token as string, 1, 100), [token], {
    enabled: Boolean(token),
  });
  const allContracts = connections.data?.items ?? [];
  const activeContracts = allContracts.filter((c) => c.status === 'ACTIVE');
  const directContracts = allContracts.filter((c) => c.job.isDirect);

  const payments = useApiResource(() => paymentsApi.mine(token as string, 1, 100), [token], {
    enabled: Boolean(token),
  });
  const earningsAvailable = (payments.data?.items ?? [])
    .filter((p) => p.status === 'PAID')
    .reduce((sum, p) => sum + Number(p.amount), 0);

  const workDiary = useApiResource(() => workDiaryApi.mine(token as string, 1, 100), [token], {
    enabled: Boolean(token) && activeTab === 'diary',
  });
  const diaryEntries = workDiary.data?.items ?? [];

  const loading = connections.loading || payments.loading;
  const list =
    activeTab === 'active'
      ? activeContracts
      : activeTab === 'direct'
        ? directContracts
        : allContracts;

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="pb-6 border-b border-border">
        <h1 className="text-2xl md:text-3xl font-extrabold text-ink tracking-tight">Contracts</h1>
        <p className="text-xs text-ink-muted mt-1">
          Manage active work and review your full contract history.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto scrollbar-none border-b border-border pb-3">
        {(
          [
            ['active', 'Active Contracts'],
            ['all', 'All Contracts'],
            ['diary', 'Work Diary'],
            ['direct', 'Direct Contracts'],
          ] as [ContractsTab, string][]
        ).map(([tab, label]) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all cursor-pointer whitespace-nowrap ${
              activeTab === tab
                ? 'bg-primary text-primary-foreground shadow-xs'
                : 'bg-white text-ink-muted hover:text-ink border border-border'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* TAB 1, 2 & 4: Active / All / Direct Contracts — real connections */}
      {(activeTab === 'active' || activeTab === 'all' || activeTab === 'direct') && (
        <div className="space-y-6">
          {activeTab === 'active' && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-ink-muted">Earnings available now:</span>
              {payments.loading ? (
                <Skeleton className="h-4 w-16" />
              ) : (
                <span className="font-bold text-primary">
                  ₹{earningsAvailable.toLocaleString('en-IN')}
                </span>
              )}
            </div>
          )}

          {loading && (
            <div className="space-y-3">
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="bg-white border border-border rounded-2xl p-6">
                  <Skeleton className="h-4 w-40 mb-2" />
                  <Skeleton className="h-3 w-56" />
                </div>
              ))}
            </div>
          )}

          {!loading && list.length === 0 && (
            <EmptyState
              title={
                activeTab === 'active'
                  ? 'There are no active contracts.'
                  : activeTab === 'direct'
                    ? 'No direct contracts'
                    : 'No contract history yet'
              }
              description={
                activeTab === 'active'
                  ? "Contracts you're actively working on will appear here."
                  : activeTab === 'direct'
                    ? 'A client hiring you directly, skipping the public job posting, will show up here.'
                    : 'Completed and cancelled contracts will show up here.'
              }
            />
          )}

          {list.map((ctr) => (
            <div
              key={ctr.id}
              onClick={() => navigate(`/contracts/${ctr.id}`)}
              className="bg-white border border-border rounded-2xl p-6 hover:border-zinc-300 hover:shadow-md transition-all cursor-pointer"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <StatusBadge status={ctr.status} />
                  </div>
                  <h3 className="text-base font-bold text-ink">{ctr.job.title}</h3>
                  <p className="text-xs text-ink-muted mt-0.5">
                    Client: {ctr.clientProfile.displayName}
                  </p>
                </div>

                <div className="text-right">
                  <span className="block text-[10px] font-mono uppercase text-ink-muted">
                    Contract Value
                  </span>
                  <span className="text-xl font-bold text-primary">
                    ₹{Number(ctr.proposal.proposedPrice).toLocaleString('en-IN')}
                  </span>
                </div>
              </div>

              <div className="pt-4 border-t border-border flex items-center justify-between text-xs text-ink-muted">
                <span>
                  Event Date:{' '}
                  {ctr.job.eventDate
                    ? new Date(ctr.job.eventDate).toLocaleDateString('en-IN', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })
                    : 'Not set'}
                </span>
                <span className="text-primary font-bold hover:underline flex items-center gap-1">
                  Open Contract Room <ChevronRight className="w-4 h-4" />
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* TAB 3: Work Diary — real entries, across every connection */}
      {activeTab === 'diary' && (
        <div className="space-y-3">
          {workDiary.loading && (
            <div className="space-y-3">
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="bg-white border border-border rounded-2xl p-5">
                  <Skeleton className="h-4 w-40 mb-2" />
                  <Skeleton className="h-3 w-56" />
                </div>
              ))}
            </div>
          )}

          {!workDiary.loading && diaryEntries.length === 0 && (
            <EmptyState
              title="No work diary entries"
              description="Dated updates you or a client post on a booking will show up here."
            />
          )}

          {diaryEntries.map((entry) => (
            <div
              key={entry.id}
              onClick={() => navigate(`/contracts/${entry.connection.id}`)}
              className="bg-white border border-border rounded-2xl p-5 hover:border-zinc-300 hover:shadow-md transition-all cursor-pointer space-y-2"
            >
              <div className="flex items-center gap-2 text-xs text-ink-muted">
                <NotebookPen className="w-3.5 h-3.5" />
                <span className="font-semibold text-ink">{entry.connection.job.title}</span>
                <span>·</span>
                <span>{entry.author.name}</span>
                <span>·</span>
                <span>
                  {new Date(entry.createdAt).toLocaleDateString('en-IN', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </span>
              </div>
              <p className="text-sm text-ink">{entry.note}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
