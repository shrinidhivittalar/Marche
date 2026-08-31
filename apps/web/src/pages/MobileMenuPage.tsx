import React, { useEffect } from 'react';
import {
  ChevronRight,
  Settings,
  LogOut,
  Users,
  IndianRupee,
  Clock,
  Bell,
  BarChart3,
  TrendingUp,
  Megaphone,
  Moon,
  Sun,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useUnreadCounts } from '../hooks/useUnreadCounts';
import { useTheme } from '@marche/ui';

type MenuLink = { label: string; path: string; icon: React.ElementType };

export const MobileMenuPage: React.FC = () => {
  const { currentUser, navigate, logoutAccount, surface, availableModes, setActiveMode } = useApp();
  const { unreadNotifications } = useUnreadCounts();
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  // Admin first everywhere below — a platform role, not a marketplace mode.
  const isAdmin = currentUser.role === 'admin';

  // Both profile routes resolve the same underlying Profile; only which one
  // is surfaced follows the mode.
  const profilePath = isAdmin
    ? '/admin/profile'
    : surface === 'PROVIDER'
      ? '/provider/profile'
      : '/client/profile';

  const homePath = isAdmin
    ? '/admin/audit'
    : surface === 'PROVIDER'
      ? '/provider/dashboard'
      : '/client/dashboard';

  // This screen is the mobile "More" tab's overflow menu — the desktop sidebar already
  // surfaces all of this, so bounce back to the dashboard if the viewport widens while here
  // (e.g. resizing the browser back to desktop after visiting on mobile).
  useEffect(() => {
    const checkViewport = () => {
      if (window.innerWidth >= 768) {
        navigate(homePath);
      }
    };
    checkViewport();
    window.addEventListener('resize', checkViewport);
    return () => window.removeEventListener('resize', checkViewport);
  }, [navigate, homePath]);

  const clientLinks: MenuLink[] = [
    { label: 'Hired freelancers', path: '/client/freelancers/hired', icon: Users },
    { label: 'Saved freelancers', path: '/client/freelancers/saved', icon: Users },
    { label: 'Bring freelancers to Marché', path: '/client/freelancers/refer', icon: Megaphone },
    { label: 'Weekly summary', path: '/client/finances/weekly-summary', icon: IndianRupee },
    { label: 'Transactions', path: '/client/finances/transactions', icon: IndianRupee },
    { label: 'Budgets', path: '/client/finances/budgets', icon: IndianRupee },
    { label: 'Work diaries', path: '/client/work-diaries', icon: Clock },
  ];

  const vendorLinks: MenuLink[] = [
    { label: 'My Work', path: '/provider/analytics', icon: BarChart3 },
    { label: 'Stats', path: '/provider/stats', icon: TrendingUp },
    { label: 'Finances', path: '/provider/finances', icon: IndianRupee },
  ];

  // Account-level, not client-only. /client/settings is the one settings
  // screen that exists, so it is appended to both surfaces rather than
  // lost when a dual-capability user switches to PROVIDER — it keeps its
  // existing position at the end of the client list.
  const SETTINGS_LINK: MenuLink = { label: 'Settings', path: '/client/settings', icon: Settings };

  const modeLinks = isAdmin
    ? []
    : [...(surface === 'PROVIDER' ? vendorLinks : clientLinks), SETTINGS_LINK];

  return (
    <div className="max-w-xl mx-auto pb-24">
      <button
        onClick={() => navigate(profilePath)}
        className="w-full flex items-center gap-3 p-4 rounded-2xl border border-border bg-surface mb-6 cursor-pointer"
      >
        <img
          src={currentUser.avatar}
          alt={currentUser.name}
          className="w-12 h-12 rounded-full object-cover ring-1 ring-border shrink-0"
        />
        <div className="min-w-0 flex-1 text-left">
          <p className="text-sm font-bold text-ink truncate">{currentUser.name}</p>
          <p className="text-xs text-ink-muted truncate">
            {currentUser.companyOrTitle || currentUser.role}
          </p>
        </div>
        <ChevronRight className="w-4 h-4 text-ink-muted shrink-0" />
      </button>

      {/* Mode switcher — the same AppContext state the desktop sidebar
          drives, so the two can never disagree. Shown only to a user who
          genuinely holds both capabilities. Presentation only: switching
          leaves currentUser and the access token untouched, and grants
          nothing — the API re-checks capabilities on every request. */}
      {availableModes.length > 1 && (
        <div className="grid grid-cols-2 gap-2 mb-6" role="group" aria-label="Active mode">
          {availableModes.map((mode) => {
            const isCurrent = mode === surface;
            return (
              <button
                key={mode}
                onClick={() => setActiveMode(mode)}
                aria-pressed={isCurrent}
                className={`px-3 py-2.5 rounded-xl text-sm font-semibold border transition-colors cursor-pointer ${
                  isCurrent
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-surface text-ink border-border hover:bg-surface-subtle'
                }`}
              >
                {mode === 'CLIENT' ? 'Hiring' : 'Providing'}
              </button>
            );
          })}
        </div>
      )}

      <div className="space-y-1">
        <button
          onClick={() => navigate('/notifications')}
          className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium text-ink hover:bg-surface-subtle transition-colors cursor-pointer"
        >
          <Bell className="w-[18px] h-[18px] text-ink-muted shrink-0" />
          <span className="flex-1 text-left">Notifications</span>
          {unreadNotifications > 0 && (
            <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-primary text-primary-foreground">
              {unreadNotifications}
            </span>
          )}
        </button>

        <button
          onClick={toggleTheme}
          className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium text-ink hover:bg-surface-subtle transition-colors cursor-pointer"
          aria-pressed={isDark}
        >
          {isDark ? (
            <Moon className="w-[18px] h-[18px] text-ink-muted shrink-0" />
          ) : (
            <Sun className="w-[18px] h-[18px] text-ink-muted shrink-0" />
          )}
          <span className="flex-1 text-left">Dark Mode</span>
          <span
            className={`relative w-9 h-5 rounded-full shrink-0 transition-colors ${
              isDark ? 'bg-primary' : 'bg-surface-subtle border border-border'
            }`}
          >
            <span
              className={`absolute left-0.5 top-0.5 w-4 h-4 rounded-full bg-white shadow-xs transition-transform ${
                isDark ? 'translate-x-4' : 'translate-x-0'
              }`}
            />
          </span>
        </button>

        {modeLinks.map((link) => {
          const Icon = link.icon;
          return (
            <button
              key={link.path}
              onClick={() => navigate(link.path)}
              className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium text-ink hover:bg-surface-subtle transition-colors cursor-pointer"
            >
              <Icon className="w-[18px] h-[18px] text-ink-muted shrink-0" />
              <span className="flex-1 text-left">{link.label}</span>
              <ChevronRight className="w-4 h-4 text-ink-muted shrink-0" />
            </button>
          );
        })}
      </div>

      <div className="sticky bottom-20 mt-6 pt-4 bg-bg border-t border-border">
        {/* Same fix as the sidebar's Log Out — see the comment there.
            navigating alone never revoked the session server-side. */}
        <button
          onClick={() => void logoutAccount()}
          className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10 bg-bg transition-colors cursor-pointer"
        >
          <LogOut className="w-[18px] h-[18px] shrink-0" />
          Log Out
        </button>
      </div>
    </div>
  );
};
