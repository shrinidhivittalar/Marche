import { CreditCard } from 'lucide-react';
import { AppProvider, useApp } from './context/AppContext';
import { Sidebar } from './components/layout/Sidebar';

// Pages
import { LandingPage } from './pages/LandingPage';
import { ComingSoonPage } from './pages/ComingSoonPage';
import { AuthSignInPage, AuthSignUpPage } from './pages/AuthPages';
import { ClientDashboard } from './pages/client/ClientDashboard';
import { CreateRequirementPage } from './pages/client/CreateRequirementPage';
import { RequirementDetailPage } from './pages/client/RequirementDetailPage';
import { ProposalDetailPage } from './pages/client/ProposalDetailPage';
import { ContractDetailPage } from './pages/client/ContractDetailPage';

import { ProviderHomePage } from './pages/provider/ProviderHomePage';
import { SearchJobsPage } from './pages/provider/SearchJobsPage';
import { ProviderDashboard } from './pages/provider/ProviderDashboard';
import { FinancesPage } from './pages/provider/FinancesPage';
import { ContractsPage } from './pages/provider/ContractsPage';
import { StatsPage } from './pages/provider/StatsPage';
import { RequirementDetailProviderView } from './pages/provider/RequirementDetailProviderView';
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

  // Dynamic Route Matchers
  const matchRoute = () => {
    // Client routes
    if (route === '/client/dashboard' || route === '/dashboard') return <ClientDashboard key="dashboard" view="dashboard" />;
    if (route === '/client/requirements') return <ClientDashboard key="requirements" view="requirements" />;
    if (route === '/client/projects') return <ClientDashboard key="projects" view="projects" />;
    if (route === '/client/settings') return <ClientDashboard key="settings" view="settings" />;
    if (route === '/client/requirements/new') return <CreateRequirementPage />;
    if (route === '/client/profile') return <EditProfilePage />;
    if (route === '/client/payments') {
      return (
        <ComingSoonPage
          title="Payments"
          description="Payment history, invoices, and escrow transaction records will be available here soon."
          icon={CreditCard}
        />
      );
    }

    if (route.startsWith('/client/requirements/')) {
      const id = route.replace('/client/requirements/', '');
      return <RequirementDetailPage id={id} />;
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

    if (route.startsWith('/provider/requirements/')) {
      const id = route.replace('/provider/requirements/', '');
      return <RequirementDetailProviderView id={id} />;
    }

    if (route.startsWith('/provider/submit-proposal/')) {
      const id = route.replace('/provider/submit-proposal/', '');
      return <SubmitProposalPage requirementId={id} />;
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
