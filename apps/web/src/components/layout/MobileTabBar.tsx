import React from 'react';
import {
  LayoutDashboard,
  Search,
  Briefcase,
  MessageSquare,
  FileSignature,
  Bell,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useUnreadCounts } from '../../hooks/useUnreadCounts';

type Tab = { label: string; path: string; icon: React.ElementType; badge?: number };

export const MobileTabBar: React.FC = () => {
  const { currentUser, route, navigate, surface } = useApp();
  const { unreadNotifications, unreadMessages } = useUnreadCounts();

  const clientTabs: Tab[] = [
    { label: 'Home', path: '/client/dashboard', icon: LayoutDashboard },
    { label: 'Search', path: '/client/search', icon: Search },
    { label: 'Jobs', path: '/client/jobs', icon: Briefcase },
    { label: 'Messages', path: '/messages', icon: MessageSquare, badge: unreadMessages },
  ];

  // Home sits in the middle of the bar (third of five, with Menu fixed
  // last) — the natural thumb position on a phone, and where Contracts
  // used to sit before this reorder.
  const vendorTabs: Tab[] = [
    { label: 'Search', path: '/provider/search', icon: Search },
    { label: 'Contracts', path: '/provider/contracts', icon: FileSignature },
    { label: 'Home', path: '/provider/dashboard', icon: LayoutDashboard },
    { label: 'Messages', path: '/messages', icon: MessageSquare, badge: unreadMessages },
  ];

  const adminTabs: Tab[] = [
    { label: 'Audit', path: '/admin/audit', icon: FileSignature },
    { label: 'Jobs', path: '/provider/dashboard', icon: Briefcase },
    { label: 'Alerts', path: '/notifications', icon: Bell, badge: unreadNotifications },
  ];

  // Admin first — a platform role, not a marketplace mode. Everyone else
  // follows the presentation surface, so switching mode swaps the tab set
  // immediately and the tabs always point at routes the gate allows.
  const tabs =
    currentUser.role === 'admin' ? adminTabs : surface === 'PROVIDER' ? vendorTabs : clientTabs;
  const isMenuActive = route === '/menu';

  return (
    <nav
      className="md:hidden fixed bottom-3 inset-x-3 z-40 bg-search-pill rounded-2xl"
      style={{
        paddingBottom: 'env(safe-area-inset-bottom)',
        boxShadow: '0 20px 40px -12px rgba(0, 0, 0, 0.35), 0 4px 12px rgba(0, 0, 0, 0.15)',
      }}
    >
      <div
        className="grid"
        style={{ gridTemplateColumns: `repeat(${tabs.length + 1}, minmax(0, 1fr))` }}
      >
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = route === tab.path;
          return (
            <button
              key={tab.label}
              onClick={() => navigate(tab.path)}
              className={`flex flex-col items-center justify-center gap-0.5 py-2 cursor-pointer ${
                isActive ? 'text-primary' : 'text-zinc-400'
              }`}
            >
              <span className="relative">
                <Icon className="w-5 h-5" />
                {tab.badge && tab.badge > 0 ? (
                  <span className="absolute -top-1 -right-1.5 w-2 h-2 rounded-full bg-primary ring-2 ring-search-pill" />
                ) : null}
              </span>
              <span className="text-[10px] font-medium">{tab.label}</span>
            </button>
          );
        })}

        <button
          onClick={() => navigate('/menu')}
          className={`flex flex-col items-center justify-center gap-0.5 py-2 cursor-pointer ${
            isMenuActive ? 'text-primary' : 'text-zinc-400'
          }`}
        >
          <span className="relative">
            <img
              src={currentUser.avatar}
              alt={currentUser.name}
              className={`w-5 h-5 rounded-full object-cover ${
                isMenuActive ? 'ring-2 ring-primary' : 'ring-1 ring-white/20'
              }`}
            />
            {unreadNotifications > 0 ? (
              <span className="absolute -top-1 -right-1.5 w-2 h-2 rounded-full bg-red-600 ring-2 ring-[#1a1512]" />
            ) : null}
          </span>
          <span className="text-[10px] font-medium">More</span>
        </button>
      </div>
    </nav>
  );
};
