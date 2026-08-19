import React from 'react';
import { NotebookPen } from 'lucide-react';
import { Skeleton } from '@marche/ui';
import { EmptyState } from '../../components/common/EmptyState';
import { useApp } from '../../context/AppContext';
import { useApiResource } from '../../hooks/useApiResource';
import { workDiaryApi } from '../../lib/work-diary-api';

// Real entries across every one of the client's connections — the provider
// side of this same aggregate lives in ContractsPage's Work Diary tab.
export const WorkDiariesPage: React.FC = () => {
  const { accessToken, navigate } = useApp();
  const token = accessToken;

  const workDiary = useApiResource(() => workDiaryApi.mine(token as string, 1, 100), [token], {
    enabled: Boolean(token),
  });
  const entries = workDiary.data?.items ?? [];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="pb-6 border-b border-border">
        <h1 className="text-2xl md:text-3xl font-extrabold text-ink tracking-tight">
          Work Diaries
        </h1>
        <p className="text-xs text-ink-muted mt-1">
          Dated updates you or a provider posted on a booking.
        </p>
      </div>

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

      {!workDiary.loading && entries.length === 0 && (
        <EmptyState
          icon={NotebookPen}
          title="No work diary entries"
          description="Updates you or a provider post on an active booking will show up here."
        />
      )}

      {entries.map((entry) => (
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
  );
};
