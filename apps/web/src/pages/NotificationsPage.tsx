import React, { useState } from 'react';
import { Bell, CheckCheck, FileText, MapPin, Megaphone, Settings2, ShieldCheck, Tags } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Button } from '@marche/ui';
import { EmptyState } from '../components/common/EmptyState';

export const NotificationsPage: React.FC = () => {
  const {
    notifications,
    currentUser,
    markNotificationRead,
    markAllNotificationsRead,
    navigate,
    jobs,
    jobAlertSettings,
    updateJobAlertSettings,
  } = useApp();

  const isVendor = currentUser.role === 'vendor';
  const [activeTab, setActiveTab] = useState<'activity' | 'alerts'>('activity');

  const userNotifs = notifications.filter((n) => n.userId === currentUser.id);
  const activityNotifs = userNotifs.filter((n) => n.type !== 'job_alert');
  const alertNotifs = userNotifs.filter((n) => n.type === 'job_alert');
  const availableCategories = Array.from(new Set(jobs.map((job) => job.category))).sort();

  const toggleAlertCategory = (category: typeof availableCategories[number]) => {
    const selected = jobAlertSettings.categories.includes(category);
    updateJobAlertSettings({
      categories: selected
        ? jobAlertSettings.categories.filter((item) => item !== category)
        : [...jobAlertSettings.categories, category],
    });
  };

  const visibleNotifs = !isVendor ? userNotifs : activeTab === 'alerts' ? alertNotifs : activityNotifs;

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

        {userNotifs.length > 0 && (
          <Button
            size="sm"
            variant="outline"
            icon={CheckCheck}
            onClick={markAllNotificationsRead}
          >
            Mark All as Read
          </Button>
        )}
      </div>

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
                {([
                  ['anywhere', 'Anywhere'],
                  ['profile_location', 'Near my profile location'],
                ] as const).map(([mode, label]) => (
                  <label key={mode} className="flex items-center gap-2 text-xs text-ink cursor-pointer">
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
      {visibleNotifs.length === 0 ? (
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
          {visibleNotifs.map((n) => (
            <div
              key={n.id}
              onClick={() => {
                markNotificationRead(n.id);
                if (n.linkRoute) navigate(n.linkRoute);
              }}
              className={`p-5 rounded-2xl border transition-all cursor-pointer flex items-start gap-4 ${
                !n.read
                  ? 'bg-white border-primary/30 shadow-xs ring-1 ring-primary/10'
                  : 'bg-bg border-border opacity-80'
              }`}
            >
              <div
                className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                  n.type === 'proposal'
                    ? 'bg-amber-100 text-amber-800'
                    : n.type === 'contract'
                    ? 'bg-emerald-100 text-primary'
                    : n.type === 'job_alert'
                    ? 'bg-sky-100 text-sky-800'
                    : 'bg-zinc-200 text-zinc-700'
                }`}
              >
                {n.type === 'proposal' ? (
                  <FileText className="w-4 h-4" />
                ) : n.type === 'contract' ? (
                  <ShieldCheck className="w-4 h-4" />
                ) : n.type === 'job_alert' ? (
                  <Megaphone className="w-4 h-4" />
                ) : (
                  <Bell className="w-4 h-4" />
                )}
              </div>

              <div className="flex-1 space-y-1">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-ink">{n.title}</h4>
                  <span className="text-[10px] font-mono text-ink-muted">
                    {new Date(n.timestamp).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
                <p className="text-xs text-ink-muted leading-relaxed">{n.message}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
