import { CreditCard, Clock, UserPlus } from 'lucide-react';
import { AppProvider, useApp } from './context/AppContext';
import { Sidebar } from './components/layout/Sidebar';

// Pages
import { LandingPage } from './pages/LandingPage';
import { ComingSoonPage } from './pages/ComingSoonPage';
import { AuthSignInPage, AuthSignUpPage } from './pages/AuthPages';
import { ClientDashboard } from './pages/client/ClientDashboard';
import { CreateJobPage } from './pages/client/CreateJobPage';
import { PostJobIntroPage } from './pages/client/PostJobIntroPage';
import { ClientOnboardingPage } from './pages/client/ClientOnboardingPage';
import { JobDetailPage } from './pages/client/JobDetailPage';
import { ProposalDetailPage } from './pages/client/ProposalDetailPage';
import { ContractDetailPage } from './pages/client/ContractDetailPage';
import { SearchTalentPage } from './pages/client/SearchTalentPage';
import { YourHiresPage } from './pages/client/freelancers/YourHiresPage';
import { SavedTalentPage } from './pages/client/freelancers/SavedTalentPage';
import { WeeklySummaryPage } from './pages/client/finances/WeeklySummaryPage';
import { TransactionsPage } from './pages/client/finances/TransactionsPage';
import { BudgetsPage } from './pages/client/finances/BudgetsPage';

import { ProviderHomePage } from './pages/provider/ProviderHomePage';
import { SearchJobsPage } from './pages/provider/SearchJobsPage';
import { ProviderDashboard } from './pages/provider/ProviderDashboard';
import { FinancesPage } from './pages/provider/FinancesPage';
import { ContractsPage } from './pages/provider/ContractsPage';
import { StatsPage } from './pages/provider/StatsPage';
import { JobDetailProviderView } from './pages/provider/JobDetailProviderView';
import { ProviderOnboardingPage } from './pages/provider/ProviderOnboardingPage';
import { SubmitProposalPage } from './pages/provider/SubmitProposalPage';
import { VendorProfilePage } from './pages/provider/VendorProfilePage';
import { EditProfilePage } from './pages/EditProfilePage';

import { AdminAuditDashboard } from './pages/admin/AdminAuditDashboard';
import { NotificationsPage } from './pages/NotificationsPage';
import { MessagesPage } from './pages/MessagesPage';

function AppContent() {
  const { route } = useApp();

  // Full-bleed views without sidebar
  if (route === '/' || route === '/landing') {
    return <LandingPage />;
  }

  if (route === '/auth/signin') {
    return <AuthSignInPage />;
  }

  if (route === '/auth/signup') {
    return <AuthSignUpPage />;
  }

  if (route === '/provider/onboarding') {
    return <ProviderOnboardingPage />;
  }

  if (route === '/client/onboarding') {
    return <ClientOnboardingPage />;
  }

  // Dynamic Route Matchers
  const matchRoute = () => {
    // Client routes
    if (route === '/client/dashboard' || route === '/dashboard') return <ClientDashboard key="dashboard" view="dashboard" />;
    if (route === '/client/search') return <SearchTalentPage />;
    if (route === '/client/freelancers/hired') return <YourHiresPage />;
    if (route === '/client/freelancers/saved') return <SavedTalentPage />;
    if (route === '/client/freelancers/refer') {
      return (
        <ComingSoonPage
          title="Bring Freelancers to Marché"
          description="Inviting providers you already work with outside Marché to join the platform will be available here soon."
          icon={UserPlus}
        />
      );
    }
    if (route === '/client/jobs' || route === '/client/projects') return <ClientDashboard key="jobs" view="jobs" />;
    if (route === '/client/settings') return <ClientDashboard key="settings" view="settings" />;
    if (route === '/client/jobs/new') return <PostJobIntroPage />;
    if (route === '/client/jobs/new/manual') return <CreateJobPage />;
    if (route.startsWith('/client/jobs/new/manual/')) {
      const draftId = route.replace('/client/jobs/new/manual/', '');
      return <CreateJobPage draftId={draftId} />;
    }
    if (route === '/client/profile') return <EditProfilePage />;
    if (route === '/client/payments') {
      return (
        <ComingSoonPage
          title="Payments"
          description="Payment history, invoices, and transaction records will be available here soon."
          icon={CreditCard}
        />
      );
    }

    if (route === '/client/finances/weekly-summary') return <WeeklySummaryPage />;
    if (route === '/client/finances/transactions') return <TransactionsPage />;
    if (route === '/client/finances/budgets') return <BudgetsPage />;

    if (route === '/client/work-diaries') {
      return (
        <ComingSoonPage
          title="Work Diaries"
          description="Time-tracking and work diary records aren't available yet in this preview."
          icon={Clock}
        />
      );
    }

    if (route.startsWith('/client/jobs/')) {
      const id = route.replace('/client/jobs/', '');
      return <JobDetailPage id={id} />;
    }

    if (route.startsWith('/client/proposals/')) {
      const id = route.replace('/client/proposals/', '');
      return <ProposalDetailPage id={id} />;
    }

    // Provider routes
    if (route === '/provider/dashboard') return <ProviderHomePage />;
    if (route === '/provider/search') return <SearchJobsPage />;
    if (route === '/provider/analytics') return <ProviderDashboard />;
    if (route === '/provider/profile') return <EditProfilePage />;
    if (route === '/provider/finances') return <FinancesPage />;
    if (route === '/provider/contracts') return <ContractsPage />;
    if (route === '/provider/stats') return <StatsPage />;

    if (route.startsWith('/provider/jobs/')) {
      const id = route.replace('/provider/jobs/', '');
      return <JobDetailProviderView id={id} />;
    }

    if (route.startsWith('/provider/submit-proposal/')) {
      const id = route.replace('/provider/submit-proposal/', '');
      return <SubmitProposalPage jobId={id} />;
    }

    if (route.startsWith('/profile/')) {
      const id = route.replace('/profile/', '');
      return <VendorProfilePage id={id} />;
    }

    // Shared & Admin routes
    if (route.startsWith('/contracts/')) {
      const id = route.replace('/contracts/', '');
      return <ContractDetailPage id={id} />;
    }

    if (route === '/admin/audit') return <AdminAuditDashboard />;
    if (route === '/messages') return <MessagesPage />;
    if (route === '/notifications') return <NotificationsPage />;

    // Fallback default
    return <ClientDashboard />;
  };

  return (
    <div className="h-screen bg-bg text-ink flex font-sans overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto p-6 lg:p-10">
        {matchRoute()}
      </main>
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
