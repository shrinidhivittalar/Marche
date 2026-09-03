import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { AppProvider, useApp } from './context/AppContext';
import { Sidebar } from './components/layout/Sidebar';
import { MobileTabBar } from './components/layout/MobileTabBar';

// Bottom-tab-bar destinations, mirroring MobileTabBar.tsx's per-role tab sets exactly —
// these are primary nav, so a back button doesn't belong there. Must stay role-aware:
// e.g. /notifications is a tab only for admin, so client/vendor still need a back button on it.
const CLIENT_ROOT_ROUTES = new Set([
  '/client/dashboard',
  '/client/search',
  '/client/jobs',
  '/messages',
  '/menu',
]);
const VENDOR_ROOT_ROUTES = new Set([
  '/provider/dashboard',
  '/provider/search',
  '/provider/contracts',
  '/messages',
  '/menu',
]);
const ADMIN_ROOT_ROUTES = new Set([
  '/admin/audit',
  '/provider/dashboard',
  '/notifications',
  '/menu',
]);

// Pages
import { LandingPage } from './pages/LandingPage';
import {
  AuthSignInPage,
  AuthSignUpPage,
  AuthVerifyEmailPage,
  AuthResetPasswordPage,
} from './pages/AuthPages';
import { ClientDashboard } from './pages/client/ClientDashboard';
import { CreateJobPage } from './pages/client/CreateJobPage';
import { PostJobIntroPage } from './pages/client/PostJobIntroPage';
import { ClientOnboardingPage } from './pages/client/ClientOnboardingPage';
import { JobDetailPage } from './pages/client/JobDetailPage';
import { ProposalDetailPage } from './pages/client/ProposalDetailPage';
import { ContractDetailPage } from './pages/client/ContractDetailPage';
import { YourHiresPage } from './pages/client/freelancers/YourHiresPage';
import { PaymentsOverviewPage } from './pages/client/PaymentsOverviewPage';
import { TransactionsPage } from './pages/client/finances/TransactionsPage';
import { WeeklySummaryPage } from './pages/client/finances/WeeklySummaryPage';
import { BudgetsPage } from './pages/client/finances/BudgetsPage';
import { WorkDiariesPage } from './pages/client/WorkDiariesPage';
import { SavedTalentPage } from './pages/client/freelancers/SavedTalentPage';
import { ReferFreelancersPage } from './pages/client/freelancers/ReferFreelancersPage';

import { ProviderHomePage } from './pages/provider/ProviderHomePage';
import { SearchJobsPage } from './pages/provider/SearchJobsPage';
import { MyWorkPage } from './pages/provider/MyWorkPage';
import { ContractsPage } from './pages/provider/ContractsPage';
import { FinancesPage } from './pages/provider/FinancesPage';
import { StatsPage } from './pages/provider/StatsPage';
import { JobDetailProviderView } from './pages/provider/JobDetailProviderView';
import { ProviderOnboardingPage } from './pages/provider/ProviderOnboardingPage';
import { SubmitProposalPage } from './pages/provider/SubmitProposalPage';
import { ProposalDetailProviderView } from './pages/provider/ProposalDetailProviderView';
import { EditProfilePage } from './pages/EditProfilePage';
import { MobileMenuPage } from './pages/MobileMenuPage';

import { AdminAuditDashboard } from './pages/admin/AdminAuditDashboard';
import { AdminDisputesPage } from './pages/admin/AdminDisputesPage';
import { AdminCategoryTemplatesPage } from './pages/admin/AdminCategoryTemplatesPage';
import { AdminUsersPage } from './pages/admin/AdminUsersPage';
import { NotificationsPage } from './pages/NotificationsPage';
import { MessagesPage } from './pages/MessagesPage';

// Exact-path routes. A plain object can't have a duplicate key silently shadow another
// (TS flags it), which is the shadowing risk the old sequential if/else chain had.
import { BrowseServicesPage } from './pages/marketplace/BrowseServicesPage';
import { MyServicesPage } from './pages/provider/MyServicesPage';
import { PublicProfilePage } from './pages/marketplace/PublicProfilePage';
import { ServiceDetailPage } from './pages/marketplace/ServiceDetailPage';

const EXACT_ROUTES: Record<string, () => ReactNode> = {
  '/client/dashboard': () => <ClientDashboard key="dashboard" view="dashboard" />,
  // The client's "Search" nav lands here, on the same API-backed browse
  // screen as /marketplace. It used to render SearchTalentPage, whose rows
  // came from mock fixtures while its links pointed at the real
  // /profiles/:id — so every result was a "Profile not found" dead end.
  // That page is gone; this one searches real services and real providers,
  // and its provider cards carry profile ids the profile route can resolve.
  '/client/search': () => <BrowseServicesPage />,
  '/client/freelancers/hired': () => <YourHiresPage />,
  '/client/freelancers/saved': () => <SavedTalentPage />,
  '/client/freelancers/refer': () => <ReferFreelancersPage />,
  '/client/jobs': () => <ClientDashboard key="jobs" view="jobs" />,
  '/client/settings': () => <ClientDashboard key="settings" view="settings" />,
  '/client/jobs/new': () => <PostJobIntroPage />,
  '/client/jobs/new/manual': () => <CreateJobPage />,
  '/client/profile': () => <EditProfilePage />,
  '/client/payments': () => <PaymentsOverviewPage />,
  '/client/finances/weekly-summary': () => <WeeklySummaryPage />,
  '/client/finances/transactions': () => <TransactionsPage />,
  '/client/finances/budgets': () => <BudgetsPage />,
  '/client/work-diaries': () => <WorkDiariesPage />,
  '/provider/dashboard': () => <ProviderHomePage />,
  '/provider/search': () => <SearchJobsPage />,
  '/provider/analytics': () => <MyWorkPage />,
  '/provider/profile': () => <EditProfilePage />,
  '/provider/services': () => <MyServicesPage />,
  '/provider/finances': () => <FinancesPage />,
  '/provider/contracts': () => <ContractsPage />,
  '/provider/stats': () => <StatsPage />,
  '/admin/audit': () => <AdminAuditDashboard />,
  '/admin/users': () => <AdminUsersPage />,
  '/admin/disputes': () => <AdminDisputesPage />,
  '/admin/categories': () => <AdminCategoryTemplatesPage />,
  '/admin/profile': () => <EditProfilePage />,
  '/marketplace': () => <BrowseServicesPage />,
  '/messages': () => <MessagesPage />,
  '/notifications': () => <NotificationsPage />,
  '/menu': () => <MobileMenuPage />,
};

// Prefix routes (path + trailing id). Order matters — first matching prefix wins, so
// the more specific '/client/jobs/new/manual/' must come before the general '/client/jobs/'.
const PREFIX_ROUTES: { prefix: string; render: (id: string) => ReactNode }[] = [
  { prefix: '/client/jobs/new/manual/', render: (draftId) => <CreateJobPage draftId={draftId} /> },
  { prefix: '/client/jobs/', render: (id) => <JobDetailPage id={id} /> },
  { prefix: '/client/proposals/', render: (id) => <ProposalDetailPage id={id} /> },
  { prefix: '/provider/jobs/', render: (id) => <JobDetailProviderView id={id} /> },
  { prefix: '/provider/submit-proposal/', render: (id) => <SubmitProposalPage jobId={id} /> },
  { prefix: '/provider/proposals/', render: (id) => <ProposalDetailProviderView id={id} /> },
  // Real API-backed profile. The previous VendorProfilePage rendered five
  // separate mock fixtures, so every marketplace search led to fake data.
  { prefix: '/profile/', render: (id) => <PublicProfilePage id={id} /> },
  { prefix: '/services/', render: (id) => <ServiceDetailPage id={id} /> },
  { prefix: '/contracts/', render: (id) => <ContractDetailPage id={id} /> },
  { prefix: '/admin/categories/', render: (id) => <AdminCategoryTemplatesPage id={id} /> },
];

function AppContent() {
  const { route, goBack, currentUser, authLoading, accessToken, surface } = useApp();

  // Full-bleed views without sidebar. Landing/Sign In/Sign Up always render light —
  // they're pre-authentication brand surfaces, not part of the user's themed workspace.
  if (route === '/' || route === '/landing') {
    return (
      <div data-theme="light">
        <LandingPage />
      </div>
    );
  }

  if (route === '/auth/signin') {
    return (
      <div data-theme="light">
        <AuthSignInPage />
      </div>
    );
  }

  if (route === '/auth/signup') {
    return (
      <div data-theme="light">
        <AuthSignUpPage />
      </div>
    );
  }

  if (route === '/auth/verify-email') {
    return (
      <div data-theme="light">
        <AuthVerifyEmailPage />
      </div>
    );
  }

  if (route === '/auth/reset-password') {
    return (
      <div data-theme="light">
        <AuthResetPasswordPage />
      </div>
    );
  }

  // The session is restored by a silent refresh after every full page load,
  // so until it settles `currentUser.role` is whatever localStorage last
  // held — 'client' by default. Applying the role gates below during that
  // window sends a signed-in provider deep-linking to /provider/... to the
  // client dashboard instead, and only corrects itself once the refresh
  // lands. Waiting is both correct and less jarring than the flash.
  //
  // The pre-authentication routes above (landing, sign-in, sign-up, verify,
  // reset) have already returned, so they are unaffected.
  if (authLoading) {
    return (
      <div
        className="h-screen bg-bg text-ink flex items-center justify-center font-sans"
        data-testid="app-auth-loading"
      >
        <p className="text-ink-muted text-sm">Loading…</p>
      </div>
    );
  }

  // Route rendering below is gated on who the user is (their capabilities,
  // and the platform role for admin), not on being signed in — logout
  // resets currentUser to a default demo profile rather than clearing it,
  // so those checks alone can't tell a real session from a logged-out one.
  // Browser back/forward changes the URL without touching
  // React state, so without this, going back after logout can land on a
  // protected route's path and render it with no access token. Catch that
  // here rather than trusting the URL.
  if (!accessToken) {
    return (
      <div data-theme="light">
        <AuthSignInPage />
      </div>
    );
  }

  // Whether the user may enter each area at all. A mode the user cannot
  // hold is never in availableModes, so selecting one grants nothing — and
  // none of this is a security boundary regardless: the API re-checks the
  // caller's capabilities on every request.
  //
  // Note one deliberate consequence for admins. The two axes are
  // independent (Module 1): platformRole governs /admin/*, capabilities
  // govern the marketplace. So an admin who *also* holds a CLIENT or
  // PROVIDER capability can now enter that marketplace area, where the
  // previous `role !== 'client'` check refused them. That is the intended
  // reading rather than an oversight: the grant is real, and the API would
  // authorize their actions there, so refusing only in the UI would have
  // been the inconsistency. Admins hold no capability rows today (the
  // Module 1 backfill gave them none), so nothing changes in practice —
  // this is about what happens when a capability is deliberately granted
  // to one. Admin routes themselves are untouched and still platform-RBAC.
  const clientAreaAllowed = surface === 'CLIENT';
  const providerAreaAllowed = surface === 'PROVIDER';

  // Sends a user to their own home instead of whatever route it just tried to reach —
  // used both for unmatched routes and for routes that belong to a different surface.
  const roleHome = () => {
    // Checked first: admin is a platform role, not a mode, and an admin has
    // no marketplace surface to fall back to.
    if (currentUser.role === 'admin') return <AdminAuditDashboard />;
    if (surface === 'PROVIDER') return <ProviderHomePage />;
    return <ClientDashboard />;
  };

  if (route === '/provider/onboarding') {
    return providerAreaAllowed ? <ProviderOnboardingPage /> : roleHome();
  }

  if (route === '/client/onboarding') {
    return clientAreaAllowed ? <ClientOnboardingPage /> : roleHome();
  }

  // Dynamic Route Matchers
  const matchRoute = () => {
    // Role gates — the sidebar only hides links for other roles, it doesn't stop someone
    // from reaching them directly by URL, so enforce it here. Routes with legitimate
    // cross-role use (e.g. admin's "Jobs" nav reusing /provider/dashboard, or /profile/:id
    // and /contracts/:id being viewed by both client and vendor) are deliberately excluded.
    // Admin stays on the platform role — it is a separate authorization
    // axis from CLIENT/PROVIDER capabilities and must not be expressed as a
    // marketplace mode.
    if (route.startsWith('/admin/') && currentUser.role !== 'admin') return roleHome();
    // /client/settings is excluded for the same reason /provider/dashboard
    // is below: it has legitimate cross-surface use. It is the only
    // settings screen that exists and is account-level rather than
    // client-specific, so a dual-capability user in PROVIDER mode must
    // still be able to open it — the sidebar offers it in both modes.
    if (route.startsWith('/client/') && route !== '/client/settings' && !clientAreaAllowed) {
      return roleHome();
    }
    if (route.startsWith('/provider/') && route !== '/provider/dashboard' && !providerAreaAllowed) {
      return roleHome();
    }

    const exact = EXACT_ROUTES[route];
    if (exact) return exact();

    for (const { prefix, render } of PREFIX_ROUTES) {
      if (route.startsWith(prefix)) {
        return render(route.slice(prefix.length));
      }
    }

    // Fallback default — send each role back to its own home, not just the client's
    return roleHome();
  };

  // Which destinations count as "root" for the mobile back button. Admin is
  // checked first: it is a platform role, not a marketplace mode, and its
  // set is the only one that includes /admin/audit.
  const rootRoutes =
    currentUser.role === 'admin'
      ? ADMIN_ROOT_ROUTES
      : surface === 'PROVIDER'
        ? VENDOR_ROOT_ROUTES
        : CLIENT_ROOT_ROUTES;
  const showMobileBack = !rootRoutes.has(route);

  const isAdminTheme = currentUser.role === 'admin';

  return (
    <div
      className="h-screen bg-bg text-ink flex font-sans overflow-hidden"
      style={
        // The dot-pattern is part of the client/provider brand texture —
        // the admin operations console is deliberately flat and calm
        // instead (see tokens.css's [data-theme='admin'] block), so a
        // plain bg-bg fill (warm cream, once the token override below
        // applies) covers the gaps around the floating Sidebar and <main>.
        isAdminTheme
          ? undefined
          : {
              backgroundImage: 'radial-gradient(rgba(17, 24, 39, 0.12) 1px, transparent 1px)',
              backgroundSize: '22px 22px',
            }
      }
      // Admin gets its own token overrides (see tokens.css's
      // [data-theme='admin'] block) — a premium operations-console
      // palette (mostly white/warm-neutral, blue reserved for structure
      // and emphasis). Set on this outer wrapper (not just <main>) so
      // bg-bg here — the surface behind the floating Sidebar and <main>
      // cards — resolves consistently instead of the client/provider
      // cream. Every existing component (Button, Card, Badge, ...) already
      // reads these same CSS variables, so this recolors admin pages with
      // zero changes to their own markup; the Sidebar itself is the one
      // exception, styled directly in Sidebar.tsx since its colors were
      // never token-driven to begin with.
      data-theme={isAdminTheme ? 'admin' : undefined}
    >
      <Sidebar />
      <main
        className={`flex-1 overflow-y-auto p-6 lg:p-10 relative ${isAdminTheme ? 'bg-bg' : ''}`}
      >
        {showMobileBack && (
          <button
            type="button"
            onClick={goBack}
            aria-label="Go back"
            className="md:hidden mb-4 flex items-center justify-center w-9 h-9 rounded-full bg-surface border border-border text-ink hover:bg-surface-subtle transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
        )}
        {matchRoute()}
        <div className="h-20 md:hidden" />
      </main>
      <MobileTabBar />
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}
