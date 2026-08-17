import React, { useState } from 'react';
import {
  LayoutDashboard,
  Briefcase,
  MessageSquare,
  CreditCard,
  Clock,
  Users,
  Bell,
  User,
  Settings,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronDown,
  BarChart3,
  IndianRupee,
  FileSignature,
  CheckCheck,
  TrendingUp,
  Search,
} from 'lucide-react';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverClose,
  Button,
  ThemeToggle,
} from '@marche/ui';
import { useApp } from '../../context/AppContext';
import { useNotifications } from '../../hooks/useNotifications';
import { notificationRoute, formatNotificationTime } from '../../lib/formatNotification';
import { NotificationIcon } from '../notifications/NotificationIcon';

const SIDEBAR_COLLAPSED_KEY = 'marche_sidebar_collapsed';

const FINANCES_LINKS = [
  { label: 'Weekly summary', path: '/client/finances/weekly-summary' },
  { label: 'Transactions', path: '/client/finances/transactions' },
  { label: 'Budgets', path: '/client/finances/budgets' },
];

const FREELANCERS_LINKS = [
  { label: 'Hired freelancers', path: '/client/freelancers/hired' },
  { label: 'Saved freelancers', path: '/client/freelancers/saved' },
  { label: 'Search for freelancers', path: '/client/search' },
  { label: 'Bring freelancers to Marché', path: '/client/freelancers/refer' },
];

// Keyed by the item's own path, not by its label. Keying by label meant a
// provider's "Finances" — a plain link to /provider/finances — picked up the
// client's sub-links, every one of which is a /client/* route the role gate
// bounces straight back to the provider's home.
const SECTION_LINKS: Record<string, { label: string; path: string }[]> = {
  '/client/payments': FINANCES_LINKS,
  '/client/freelancers/hired': FREELANCERS_LINKS,
};

export const Sidebar: React.FC = () => {
  const { currentUser, route, navigate, contracts, messages } = useApp();
  const {
    notifications,
    loading: notificationsLoading,
    error: notificationsError,
    unreadCount,
    markAsRead: markNotificationRead,
    markAllRead: markAllNotificationsRead,
  } = useNotifications();

  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true',
  );
  const [identityOpen, setIdentityOpen] = useState(false);
  const [expandedSection, setExpandedSection] = useState<string | null>(() => {
    if (route.startsWith('/client/finances/')) return 'Finances';
    if (route.startsWith('/client/freelancers/')) return 'Freelancers';
    return null;
  });

  const toggleSection = (label: string) => {
    setExpandedSection((prev) => (prev === label ? null : label));
  };

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next));
      return next;
    });
  };

  // Already scoped to the caller by the API — no client-side filter needed.
  const recentNotifs = notifications.slice(0, 5);

  const myContractIds = new Set(
    contracts
      .filter((c) => c.clientId === currentUser.id || c.vendorId === currentUser.id)
      .map((c) => c.id),
  );
  const unreadMessageCount = messages.filter(
    (m) => myContractIds.has(m.contractId) && m.senderId !== currentUser.id && !m.read,
  ).length;

  const clientNav = [
    { label: 'Home', path: '/client/dashboard', icon: LayoutDashboard },
    { label: 'Search', path: '/client/search', icon: Search },
    { label: 'Jobs', path: '/client/jobs', icon: Briefcase },
    { label: 'Freelancers', path: '/client/freelancers/hired', icon: Users },
    { label: 'Messages', path: '/messages', icon: MessageSquare, badge: unreadMessageCount },
    { label: 'Finances', path: '/client/payments', icon: CreditCard },
    { label: 'Work Diaries', path: '/client/work-diaries', icon: Clock },
    { label: 'Notifications', path: '/notifications', icon: Bell, badge: unreadCount },
  ];

  const vendorNav = [
    { label: 'Home', path: '/provider/dashboard', icon: LayoutDashboard },
    { label: 'Search Jobs', path: '/provider/search', icon: Search },
    { label: 'My Work', path: '/provider/analytics', icon: BarChart3 },
    { label: 'Stats', path: '/provider/stats', icon: TrendingUp },
    { label: 'Contracts', path: '/provider/contracts', icon: FileSignature },
    { label: 'Finances', path: '/provider/finances', icon: IndianRupee },
    { label: 'Messages', path: '/messages', icon: MessageSquare, badge: unreadMessageCount },
    { label: 'Notifications', path: '/notifications', icon: Bell, badge: unreadCount },
  ];

  const adminNav = [
    { label: 'Payments & Audit', path: '/admin/audit', icon: CreditCard },
    { label: 'Jobs', path: '/provider/dashboard', icon: Briefcase },
    { label: 'Notifications', path: '/notifications', icon: Bell, badge: unreadCount },
  ];

  const navItems =
    currentUser.role === 'client'
      ? clientNav
      : currentUser.role === 'vendor'
        ? vendorNav
        : adminNav;

  const homePath =
    currentUser.role === 'client'
      ? '/client/dashboard'
      : currentUser.role === 'vendor'
        ? '/provider/dashboard'
        : currentUser.role === 'admin'
          ? '/admin/audit'
          : '/';

  const profilePath =
    currentUser.role === 'vendor'
      ? '/provider/profile'
      : currentUser.role === 'client'
        ? '/client/profile'
        : '/admin/profile';

  const identityItemClass = (variant: 'default' | 'danger' = 'default') =>
    `w-full flex items-center rounded-lg text-xs font-medium transition-colors cursor-pointer ${
      collapsed ? 'justify-center p-2' : 'gap-2.5 px-2.5 py-2'
    } ${
      variant === 'danger'
        ? 'text-rose-600 hover:bg-rose-50'
        : 'text-ink-muted hover:text-ink hover:bg-surface-subtle'
    }`;

  return (
    <aside
      className={`${
        collapsed ? 'w-[68px]' : 'w-60'
      } bg-bg border-r border-border min-h-screen p-3 hidden md:flex md:flex-col justify-between shrink-0 transition-[width] duration-200`}
    >
      <div className="space-y-4">
        {/* Brand & Collapse Toggle */}
        <div
          className={`flex items-center pb-1 ${collapsed ? 'flex-col gap-2' : 'justify-between'}`}
        >
          <button
            onClick={() => navigate(homePath)}
            className="flex items-center gap-2.5 cursor-pointer group"
          >
            <div className="w-8 h-8 rounded-xl bg-primary text-primary-foreground flex items-center justify-center font-bold text-lg tracking-tight group-hover:bg-primary-hover transition-colors shadow-xs shrink-0">
              M
            </div>
            {!collapsed && (
              <span className="text-lg font-extrabold tracking-tight text-ink">MARCHÉ</span>
            )}
          </button>

          <div className={`flex items-center ${collapsed ? 'flex-col gap-2' : 'gap-1'}`}>
            <ThemeToggle className="!size-auto p-2 rounded-lg hover:bg-surface-subtle" />

            <button
              onClick={toggleCollapsed}
              title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              className="flex items-center p-2 rounded-lg text-ink-muted hover:text-ink hover:bg-surface-subtle transition-colors cursor-pointer"
            >
              {collapsed ? (
                <PanelLeftOpen className="w-4 h-4" />
              ) : (
                <PanelLeftClose className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>

        {/* Navigation Group */}
        <nav className="space-y-1.5">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              route === item.path ||
              // Matched on the item's own path for the same reason
              // SECTION_LINKS is: a provider's Finances must not light up
              // because a client finance route is open.
              (item.path === '/client/payments' && route.startsWith('/client/finances/')) ||
              (item.path === '/client/freelancers/hired' &&
                route.startsWith('/client/freelancers/'));
            const navButtonClass = `w-full flex items-center rounded-xl text-xs font-medium transition-all cursor-pointer ${
              collapsed ? 'justify-center p-2.5' : 'justify-between px-3.5 py-2.5'
            } ${
              isActive
                ? 'bg-surface text-primary font-bold border border-border shadow-2xs'
                : 'text-ink-muted hover:text-ink hover:bg-surface-subtle'
            }`;
            const navButtonContent = (
              <>
                <div className={`flex items-center relative ${collapsed ? '' : 'gap-3'}`}>
                  <Icon
                    className={`w-[18px] h-[18px] shrink-0 ${isActive ? 'text-primary' : 'text-ink-muted'}`}
                  />
                  {!collapsed && <span>{item.label}</span>}
                  {collapsed && item.badge && item.badge > 0 ? (
                    <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-primary ring-2 ring-bg" />
                  ) : null}
                </div>
                {!collapsed && item.badge && item.badge > 0 ? (
                  <span
                    data-testid={
                      item.label === 'Notifications' ? 'notifications-unread-badge' : undefined
                    }
                    className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-primary text-primary-foreground"
                  >
                    {item.badge}
                  </span>
                ) : null}
              </>
            );

            if (item.label === 'Notifications') {
              return (
                <Popover key={item.label}>
                  <PopoverTrigger
                    title={collapsed ? item.label : undefined}
                    className={navButtonClass}
                    data-testid="notifications-bell"
                  >
                    {navButtonContent}
                  </PopoverTrigger>
                  <PopoverContent side="right" align="start" className="w-80 p-0">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                      <span className="text-xs font-bold text-ink">Notifications</span>
                      {unreadCount > 0 && (
                        <button
                          data-testid="mark-all-read-dropdown"
                          onClick={async () => {
                            // Caught, not surfaced: a failure here leaves the
                            // real unread state untouched (no optimistic
                            // update happened), so the worst case is that
                            // nothing changes — not that the UI lies. The
                            // full activity page is where a failed action
                            // gets a visible message.
                            try {
                              await markAllNotificationsRead();
                            } catch (error) {
                              console.error('Failed to mark all notifications read', error);
                            }
                          }}
                          className="flex items-center gap-1 text-[11px] font-medium text-primary hover:underline cursor-pointer"
                        >
                          <CheckCheck className="w-3.5 h-3.5" />
                          Mark all read
                        </button>
                      )}
                    </div>

                    {/* Same rule as NotificationsPage: `loading` covers
                        refetches, and "Mark all read" fires one while the
                        dropdown is open — the list must not blank out under
                        the click that caused it. */}
                    {notificationsLoading && recentNotifs.length === 0 ? (
                      <div className="px-4 py-8 text-center text-xs text-ink-muted">Loading…</div>
                    ) : notificationsError ? (
                      <div className="px-4 py-8 text-center text-xs text-destructive">
                        {notificationsError}
                      </div>
                    ) : recentNotifs.length === 0 ? (
                      <div
                        data-testid="notifications-dropdown-empty"
                        className="px-4 py-8 text-center text-xs text-ink-muted"
                      >
                        You're all caught up.
                      </div>
                    ) : (
                      <div className="max-h-80 overflow-y-auto">
                        {recentNotifs.map((n) => {
                          const route = notificationRoute(n, currentUser.role);
                          const unread = n.readAt === null;
                          return (
                            <PopoverClose asChild key={n.id}>
                              <button
                                data-testid="notification-dropdown-item"
                                data-type={n.type}
                                data-unread={unread}
                                onClick={() => {
                                  // Not awaited: navigation shouldn't wait on
                                  // it. Caught so a failure can't become an
                                  // unhandled rejection — see the mark-all
                                  // handler above for why nothing further is
                                  // needed here.
                                  if (unread) {
                                    markNotificationRead(n.id).catch((error) => {
                                      console.error('Failed to mark notification read', error);
                                    });
                                  }
                                  if (route) navigate(route);
                                }}
                                className={`w-full flex items-start gap-3 px-4 py-3 text-left border-b border-border last:border-0 transition-colors cursor-pointer hover:bg-bg ${
                                  unread ? 'bg-surface-subtle' : ''
                                }`}
                              >
                                <NotificationIcon type={n.type} size="sm" />
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center justify-between gap-2">
                                    <p className="text-xs font-bold text-ink truncate">{n.title}</p>
                                    <span className="text-[10px] font-mono text-ink-muted shrink-0">
                                      {formatNotificationTime(n)}
                                    </span>
                                  </div>
                                  <p className="text-[11px] text-ink-muted line-clamp-2 leading-relaxed">
                                    {n.message}
                                  </p>
                                </div>
                              </button>
                            </PopoverClose>
                          );
                        })}
                      </div>
                    )}

                    <div className="p-2 border-t border-border">
                      <PopoverClose asChild>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="w-full justify-center"
                          onClick={() => navigate('/notifications')}
                          data-testid="view-all-notifications"
                        >
                          View All Notifications
                        </Button>
                      </PopoverClose>
                    </div>
                  </PopoverContent>
                </Popover>
              );
            }

            const sectionLinks = SECTION_LINKS[item.path];
            if (sectionLinks) {
              // Collapsed sidebar can't fit an inline-expanding sub-list — fall back to a flyout popover.
              if (collapsed) {
                return (
                  <Popover key={item.label}>
                    <PopoverTrigger title={item.label} className={navButtonClass}>
                      {navButtonContent}
                    </PopoverTrigger>
                    <PopoverContent side="right" align="start" className="w-56 p-1.5">
                      {sectionLinks.map((link) => (
                        <PopoverClose asChild key={link.path}>
                          <button
                            onClick={() => navigate(link.path)}
                            className="w-full text-left px-2.5 py-2 rounded-lg text-xs font-medium text-ink hover:bg-bg transition-colors cursor-pointer"
                          >
                            {link.label}
                          </button>
                        </PopoverClose>
                      ))}
                    </PopoverContent>
                  </Popover>
                );
              }

              const isExpanded = expandedSection === item.label;
              return (
                <div key={item.label}>
                  <button onClick={() => toggleSection(item.label)} className={navButtonClass}>
                    <div className="flex items-center gap-3">
                      <Icon
                        className={`w-[18px] h-[18px] shrink-0 ${isActive ? 'text-primary' : 'text-ink-muted'}`}
                      />
                      <span>{item.label}</span>
                    </div>
                    <ChevronDown
                      className={`w-3.5 h-3.5 text-ink-muted shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                    />
                  </button>
                  {isExpanded && (
                    <div className="ml-[26px] mt-1 mb-1 space-y-0.5 border-l border-border pl-3">
                      {sectionLinks.map((link) => (
                        <button
                          key={link.path}
                          onClick={() => navigate(link.path)}
                          className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
                            route === link.path
                              ? 'bg-surface text-primary font-bold border border-border shadow-2xs'
                              : 'text-ink-muted hover:text-ink hover:bg-surface-subtle'
                          }`}
                        >
                          {link.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            }

            return (
              <button
                key={item.label}
                onClick={() => navigate(item.path)}
                title={collapsed ? item.label : undefined}
                className={navButtonClass}
              >
                {navButtonContent}
              </button>
            );
          })}
        </nav>
      </div>

      {/* User Identity Chip (inline accordion, not a popover) — bottom of sidebar */}
      <div className="pt-3 border-t border-border">
        {identityOpen && (
          <div className="mb-1 space-y-0.5">
            <button onClick={() => navigate(profilePath)} className={identityItemClass()}>
              <User className="w-4 h-4 shrink-0" />
              {!collapsed && <span>My Profile</span>}
            </button>

            {currentUser.role === 'client' && (
              <button onClick={() => navigate('/client/settings')} className={identityItemClass()}>
                <Settings className="w-4 h-4 shrink-0" />
                {!collapsed && <span>Settings</span>}
              </button>
            )}

            <button
              onClick={() => navigate('/auth/signin')}
              className={identityItemClass('danger')}
            >
              <LogOut className="w-4 h-4 shrink-0" />
              {!collapsed && <span>Log Out</span>}
            </button>
          </div>
        )}

        <button
          onClick={() => setIdentityOpen((prev) => !prev)}
          title={collapsed ? currentUser.name : undefined}
          className={`w-full flex items-center rounded-xl transition-colors cursor-pointer ${
            collapsed ? 'justify-center p-2' : 'justify-between px-2.5 py-2 hover:bg-surface-subtle'
          }`}
        >
          <div className={`flex items-center min-w-0 ${collapsed ? '' : 'gap-2.5'}`}>
            <img
              src={currentUser.avatar}
              alt={currentUser.name}
              className="w-8 h-8 rounded-full object-cover ring-1 ring-border shrink-0"
            />
            {!collapsed && (
              <div className="min-w-0 text-left">
                <p className="text-xs font-bold text-ink truncate">{currentUser.name}</p>
                <p className="text-[10px] text-ink-muted truncate">
                  {currentUser.companyOrTitle || currentUser.role}
                </p>
              </div>
            )}
          </div>
          {!collapsed && (
            <ChevronDown
              className={`w-3.5 h-3.5 text-ink-muted shrink-0 transition-transform ${
                identityOpen ? 'rotate-180' : ''
              }`}
            />
          )}
        </button>
      </div>
    </aside>
  );
};
