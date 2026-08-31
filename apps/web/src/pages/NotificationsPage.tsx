import React, { useState } from 'react';
import { CheckCheck, MapPin, Megaphone, Settings2, Tags } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useNotifications } from '../hooks/useNotifications';
import { Button, Skeleton } from '@marche/ui';
import { EmptyState } from '../components/common/EmptyState';
import { notificationRoute, formatNotificationTime } from '../lib/formatNotification';
import { NotificationIcon } from '../components/notifications/NotificationIcon';

// The "activity" feed (real proposal/job events) now comes from Module 6's
// API. "Job Alerts" stays on AppContext's mock jobAlertSettings — that
// feature has no backend yet, and is a different notion of "notification"
// entirely (a saved-preference match, not an event about something that
// happened), so it isn't part of this rewire.
export const NotificationsPage: React.FC = () => {
  const { currentUser, navigate, surface, jobs, jobAlertSettings, updateJobAlertSettings } =
    useApp();
  const { notifications, loading, error, hasMore, loadMore, markAsRead, markAllRead } =
    useNotifications();

  const isVendor = currentUser.role === 'vendor';
  const [activeTab, setActiveTab] = useState<'activity' | 'alerts'>('activity');
  const [actionError, setActionError] = useState<string | null>(null);

  const availableCategories = Array.from(new Set(jobs.map((job) => job.category))).sort();

  const toggleAlertCategory = (category: (typeof availableCategories)[number]) => {
    const selected = jobAlertSettings.categories.includes(category);
    updateJobAlertSettings({
      categories: selected
        ? jobAlertSettings.categories.filter((item) => item !== category)
        : [...jobAlertSettings.categories, category],
    });
  };

  // "alerts" is always empty: job alerts have no backend yet (see the note
  // above the component), so there is nothing real to show there.
  const visibleNotifs = !isVendor || activeTab === 'activity' ? notifications : [];

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between pb-6 border-b border-border">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono uppercase font-semibold text-primary mb-1">
            <span className="w-2 h-2 rounded-full bg-primary" />
            <span>Activity Feed</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-ink tracking-tight">
            Notifications & Updates
          </h1>
          <p className="text-xs text-ink-muted mt-1">
            Real-time updates for your jobs, proposals, and contracts.
          </p>
        </div>

        {activeTab === 'activity' && notifications.length > 0 && (
          <Button
            size="sm"
            variant="outline"
            icon={CheckCheck}
            onClick={async () => {
              setActionError(null);
              try {
                await markAllRead();
              } catch {
                setActionError("Couldn't mark all as read. Try again.");
              }
            }}
            data-testid="mark-all-read"
          >
            Mark All as Read
          </Button>
        )}
      </div>

      {actionError && (
        <div className="p-4 rounded-2xl border border-destructive/40 bg-destructive/5">
          <p className="text-xs font-semibold text-destructive">{actionError}</p>
        </div>
      )}

      {/* Activity / Job Alerts Tabs (vendor only) */}
      {isVendor && (
        <div className="flex items-center gap-2 -mt-4 border-b border-border pb-3">
          <button
            onClick={() => setActiveTab('activity')}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all cursor-pointer ${
              activeTab === 'activity'
                ? 'bg-primary text-primary-foreground shadow-xs'
                : 'bg-white text-ink-muted hover:text-ink border border-border'
            }`}
          >
            Activity
          </button>
          <button
            onClick={() => setActiveTab('alerts')}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all cursor-pointer ${
              activeTab === 'alerts'
                ? 'bg-primary text-primary-foreground shadow-xs'
                : 'bg-white text-ink-muted hover:text-ink border border-border'
            }`}
          >
            Job Alerts
          </button>
        </div>
      )}

      {isVendor && activeTab === 'alerts' && (
        <div className="bg-surface border border-border rounded-2xl p-5 space-y-5 -mt-2">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <Settings2 className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm font-extrabold text-ink">Job alert preferences</h2>
                <p className="text-xs text-ink-muted mt-1">
                  Alerts are created when newly posted jobs match these saved provider preferences.
                </p>
              </div>
            </div>
            <label className="flex items-center gap-2 text-xs font-semibold text-ink cursor-pointer">
              <span>{jobAlertSettings.enabled ? 'On' : 'Off'}</span>
              <button
                type="button"
                onClick={() => updateJobAlertSettings({ enabled: !jobAlertSettings.enabled })}
                className={`relative w-10 h-5 rounded-full transition-colors cursor-pointer ${jobAlertSettings.enabled ? 'bg-primary' : 'bg-surface-subtle border border-border'}`}
                aria-pressed={jobAlertSettings.enabled}
              >
                <span
                  className={`absolute left-0.5 top-0.5 w-4 h-4 rounded-full bg-white shadow-xs transition-transform ${jobAlertSettings.enabled ? 'translate-x-5' : 'translate-x-0'}`}
                />
              </button>
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-[1.4fr_1fr] gap-5 pt-4 border-t border-border">
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold text-ink">
                <Tags className="w-4 h-4 text-primary" />
                Categories
              </div>
              <div className="flex flex-wrap gap-2">
                {availableCategories.map((category) => {
                  const selected = jobAlertSettings.categories.includes(category);
                  return (
                    <button
                      key={category}
                      type="button"
                      onClick={() => toggleAlertCategory(category)}
                      className={`px-3 py-1.5 rounded-full border text-xs font-semibold transition-colors cursor-pointer ${
                        selected
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-bg text-ink-muted border-border hover:text-ink hover:border-border-strong'
                      }`}
                    >
                      {category}
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] text-ink-muted">
                Leaving every category off will match all categories.
              </p>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold text-ink">
                <MapPin className="w-4 h-4 text-primary" />
                Location
              </div>
              <div className="space-y-2">
                {(
                  [
                    ['anywhere', 'Anywhere'],
                    ['profile_location', 'Near my profile location'],
                  ] as const
                ).map(([mode, label]) => (
                  <label
                    key={mode}
                    className="flex items-center gap-2 text-xs text-ink cursor-pointer"
                  >
                    <input
                      type="radio"
                      name="job-alert-location"
                      checked={jobAlertSettings.locationMode === mode}
                      onChange={() => updateJobAlertSettings({ locationMode: mode })}
                      className="text-primary focus:ring-primary"
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Notifications List */}
      {/* `loading` is true for refetches too, not only the first load — every
          mark-as-read triggers one (see AppContext's markAllApiNotificationsRead).
          The list we already have stays on screen through those; the loading
          text is only for having nothing to show yet. */}
      {activeTab === 'activity' && loading && notifications.length === 0 ? (
        <div className="space-y-3" data-testid="notifications-loading">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="p-5 rounded-2xl border border-border bg-bg flex items-start gap-4"
            >
              <Skeleton className="w-9 h-9 rounded-full shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-3 w-3/4" />
              </div>
            </div>
          ))}
        </div>
      ) : activeTab === 'activity' && error ? (
        <div className="p-5 rounded-2xl border border-destructive/40 bg-destructive/5">
          <p className="text-xs font-semibold text-destructive">{error}</p>
        </div>
      ) : visibleNotifs.length === 0 ? (
        isVendor && activeTab === 'alerts' ? (
          <div className="bg-bg border border-border rounded-3xl py-16 px-8 flex flex-col items-center text-center gap-4">
            <div className="w-20 h-20 rounded-2xl bg-sky-100 text-sky-800 flex items-center justify-center">
              <Megaphone className="w-9 h-9" />
            </div>
            <div className="space-y-1.5">
              <h2 className="text-xl font-extrabold text-ink tracking-tight">
                Get notified about new job alerts
              </h2>
              <p className="text-sm text-ink-muted max-w-sm">
                We'll alert you here the moment a new job matches your services.
              </p>
            </div>
            <Button onClick={() => navigate('/provider/dashboard')}>Explore Jobs</Button>
          </div>
        ) : (
          <EmptyState
            title="No notifications yet"
            description="You are all caught up! New proposal alerts and booking updates will appear here."
          />
        )
      ) : (
        <div className="space-y-3">
          {visibleNotifs.map((n) => {
            const route = notificationRoute(n, surface);
            const unread = n.readAt === null;
            return (
              <div
                key={n.id}
                data-testid="notification-row"
                data-type={n.type}
                data-unread={unread}
                onClick={() => {
                  // Not awaited: navigation shouldn't wait on it. Caught so
                  // a failure surfaces here instead of becoming an unhandled
                  // rejection — see the Mark All as Read handler above.
                  if (unread) {
                    markAsRead(n.id).catch(() => {
                      setActionError("Couldn't mark that notification as read. Try again.");
                    });
                  }
                  if (route) navigate(route);
                }}
                className={`p-5 rounded-2xl border transition-all cursor-pointer flex items-start gap-4 ${
                  unread
                    ? 'bg-white border-primary/30 shadow-xs ring-1 ring-primary/10'
                    : 'bg-bg border-border opacity-80'
                }`}
              >
                <NotificationIcon type={n.type} />

                <div className="flex-1 space-y-1">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-ink">{n.title}</h4>
                    <span className="text-[10px] font-mono text-ink-muted">
                      {formatNotificationTime(n)}
                    </span>
                  </div>
                  <p className="text-xs text-ink-muted leading-relaxed">{n.message}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {activeTab === 'activity' && hasMore && (
        <div className="flex justify-center">
          <Button size="sm" variant="outline" onClick={loadMore} disabled={loading}>
            {loading ? 'Loading…' : 'Load more'}
          </Button>
        </div>
      )}
    </div>
  );
};
