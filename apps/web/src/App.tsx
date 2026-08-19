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
  '/admin/disputes': () => <AdminDisputesPage />,
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
];

function AppContent() {
  const { route, goBack, currentUser, authLoading, accessToken } = useApp();

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

  // Route rendering below is gated on currentUser.role, not on being signed
  // in — logout resets currentUser to a default demo profile rather than
  // clearing it, so the role checks alone can't tell a real session from a
  // logged-out one. Browser back/forward changes the URL without touching
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

  // Sends a role to its own home instead of whatever route it just tried to reach —
  // used both for unmatched routes and for routes that belong to a different role.
  const roleHome = () => {
    if (currentUser.role === 'vendor') return <ProviderHomePage />;
    if (currentUser.role === 'admin') return <AdminAuditDashboard />;
    return <ClientDashboard />;
  };

  if (route === '/provider/onboarding') {
    return currentUser.role === 'vendor' ? <ProviderOnboardingPage /> : roleHome();
  }

  if (route === '/client/onboarding') {
    return currentUser.role === 'client' ? <ClientOnboardingPage /> : roleHome();
  }

  // Dynamic Route Matchers
  const matchRoute = () => {
    // Role gates — the sidebar only hides links for other roles, it doesn't stop someone
    // from reaching them directly by URL, so enforce it here. Routes with legitimate
    // cross-role use (e.g. admin's "Jobs" nav reusing /provider/dashboard, or /profile/:id
    // and /contracts/:id being viewed by both client and vendor) are deliberately excluded.
    if (route.startsWith('/admin/') && currentUser.role !== 'admin') return roleHome();
    if (route.startsWith('/client/') && currentUser.role !== 'client') return roleHome();
    if (
      route.startsWith('/provider/') &&
      route !== '/provider/dashboard' &&
      currentUser.role !== 'vendor'
    ) {
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

  const rootRoutes =
    currentUser.role === 'client'
      ? CLIENT_ROOT_ROUTES
      : currentUser.role === 'vendor'
        ? VENDOR_ROOT_ROUTES
        : ADMIN_ROOT_ROUTES;
  const showMobileBack = !rootRoutes.has(route);

  return (
    <div className="h-screen bg-bg text-ink flex font-sans overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto p-6 lg:p-10 relative">
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
