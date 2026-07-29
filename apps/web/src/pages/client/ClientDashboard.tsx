import React, { useState } from 'react';
import {
  Plus,
  Briefcase,
  FileText,
  Clock,
  ArrowUpRight,
  ShieldCheck,
  Calendar,
  MapPin,
  DollarSign,
  Search,
  MessageSquare,
  CheckCircle2,
  Pause,
  Play,
  Trash2,
  Edit3,
  UserPlus,
  Bell,
  Sparkles,
  X,
  Eye,
  Inbox,
  FolderKanban,
  Settings as SettingsIcon,
  User,
  Shield,
  CreditCard,
  Sliders,
  ChevronRight,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Button, Card, Input } from '@marche/ui';
import { StatusBadge } from '../../components/common/StatusBadge';
import { Requirement, Proposal, Contract } from '../../types';
import { formatEventSchedule } from '../../lib/formatTime';

interface ClientDashboardProps {
  view?: 'dashboard' | 'requirements' | 'projects' | 'settings';
}

export const ClientDashboard: React.FC<ClientDashboardProps> = ({
  view = 'dashboard',
}) => {
  const {
    currentUser,
    requirements,
    proposals,
    contracts,
    notifications,
    navigate,
    createRequirement,
    togglePauseRequirement,
    deleteRequirement,
    updateRequirement,
    markNotificationRead,
  } = useApp();

  // Filter tabs for Requirements View
  const [activeTab, setActiveTab] = useState<
    'all' | 'active' | 'proposals' | 'progress' | 'completed'
  >('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');

  // Modals state
  const [editModalReq, setEditModalReq] = useState<Requirement | null>(null);
  const [deleteConfirmReq, setDeleteConfirmReq] = useState<Requirement | null>(null);
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [inviteVendorName, setInviteVendorName] = useState('');
  const [messageModalOpen, setMessageModalOpen] = useState(false);
  const [messageRecipient, setMessageRecipient] = useState('Julian Vance (Photography)');

  // Edit form state
  const [editTitle, setEditTitle] = useState('');
  const [editBudgetMin, setEditBudgetMin] = useState<number>(0);
  const [editBudgetMax, setEditBudgetMax] = useState<number>(0);
  const [editLocation, setEditLocation] = useState('');

  // Toast feedback
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Row action menu (default dashboard view)
  const [activeMenuReqId, setActiveMenuReqId] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // User's requirements
  const myRequirements = requirements.filter((r) => r.clientId === currentUser.id);

  // Stats calculation
  const receivingProposalsCount = myRequirements.filter((r) => {
    const pCount = proposals.filter((p) => p.requirementId === r.id).length;
    return pCount > 0 && r.status !== 'Completed' && r.status !== 'Closed';
  }).length;

  const activeRequirementsCount = myRequirements.filter(
    (r) => r.status !== 'Completed' && r.status !== 'Closed' && r.status !== 'Cancelled'
  ).length;

  const inProgressContracts = contracts.filter(
    (c) => c.clientId === currentUser.id && c.bookingState === 'Confirmed'
  );

  const completedContracts = contracts.filter(
    (c) =>
      c.clientId === currentUser.id &&
      (c.bookingState === 'Completed' || c.bookingState === 'Escrow Released')
  );

  const totalEscrowManaged = contracts
    .filter((c) => c.clientId === currentUser.id)
    .reduce((sum, c) => sum + c.amount, 0);

  // Filtered Requirements for Requirements View
  const filteredRequirements = myRequirements.filter((r) => {
    const reqProposals = proposals.filter((p) => p.requirementId === r.id);
    const hasActiveContract = contracts.some((c) => c.requirementId === r.id);

    if (activeTab === 'active') {
      if (r.status === 'Completed' || r.status === 'Closed' || r.status === 'Cancelled') return false;
    } else if (activeTab === 'proposals') {
      if (reqProposals.length === 0 || hasActiveContract) return false;
    } else if (activeTab === 'progress') {
      const ctr = contracts.find((c) => c.requirementId === r.id);
      if (!ctr && r.status !== 'In Progress' && r.status !== 'Escrow Held') return false;
    } else if (activeTab === 'completed') {
      if (r.status !== 'Completed' && r.status !== 'Closed') return false;
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTitle = r.title.toLowerCase().includes(q);
      const matchCat = r.category.toLowerCase().includes(q);
      const matchLoc = r.location.toLowerCase().includes(q);
      if (!matchTitle && !matchCat && !matchLoc) return false;
    }

    if (categoryFilter !== 'All' && r.category !== categoryFilter) {
      return false;
    }

    return true;
  });

  // Attention Items for Dashboard
  const attentionItems = [];

  const reqsWithNewProposals = myRequirements.filter((r) => {
    const pCount = proposals.filter((p) => p.requirementId === r.id).length;
    const hasContract = contracts.some((c) => c.requirementId === r.id);
    return pCount > 0 && !hasContract;
  });

  if (reqsWithNewProposals.length > 0) {
    const topReq = reqsWithNewProposals[0]!;
    const topProposals = proposals.filter((p) => p.requirementId === topReq.id);
    attentionItems.push({
      id: 'att_prop',
      type: 'proposal' as const,
      title: `${topProposals.length} new proposals received for "${topReq.title}"`,
      description: 'Review competitive vendor bids, portfolio samples, and milestone breakdown.',
      actionLabel: 'Review Proposals',
      onAction: () => navigate(`/client/requirements/${topReq.id}`),
      badgeText: 'Action Needed',
      badgeColor: 'bg-amber-100 text-amber-900 border-amber-200',
    });
  }

  const activeContractsList = contracts.filter((c) => c.clientId === currentUser.id);
  if (activeContractsList.length > 0) {
    const ctr = activeContractsList[0]!;
    attentionItems.push({
      id: 'att_escrow',
      type: 'escrow' as const,
      title: `Escrow Held: $${ctr.amount.toLocaleString()} for "${ctr.requirementTitle}"`,
      description: `Provider ${ctr.vendorName} is actively working on your booking. Check contract status or release milestones.`,
      actionLabel: 'Manage Escrow',
      onAction: () => navigate(`/contracts/${ctr.id}`),
      badgeText: 'Escrow Protected',
      badgeColor: 'bg-emerald-100 text-primary border-emerald-200',
    });
  }

  const upcomingReq = myRequirements.find(
    (r) => r.eventDate && new Date(r.eventDate) >= new Date()
  );
  if (upcomingReq) {
    attentionItems.push({
      id: 'att_event',
      type: 'event' as const,
      title: `Upcoming Event: ${upcomingReq.title}`,
      description: `Scheduled for ${formatEventSchedule(upcomingReq.eventDate, upcomingReq.timingMode, upcomingReq.eventStartTime, upcomingReq.eventEndTime)} at ${upcomingReq.location}.`,
      actionLabel: 'View Requirement Brief',
      onAction: () => navigate(`/client/requirements/${upcomingReq.id}`),
      badgeText: 'Scheduled Date',
      badgeColor: 'bg-blue-100 text-blue-900 border-blue-200',
    });
  }

  // Handlers
  const openEditModal = (req: Requirement) => {
    setEditModalReq(req);
    setEditTitle(req.title);
    setEditBudgetMin(req.budgetMin);
    setEditBudgetMax(req.budgetMax);
    setEditLocation(req.location);
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editModalReq) return;
    updateRequirement(editModalReq.id, {
      title: editTitle,
      budgetMin: Number(editBudgetMin),
      budgetMax: Number(editBudgetMax),
      location: editLocation,
    });
    setEditModalReq(null);
    showToast('Requirement details updated successfully.');
  };

  const handleConfirmDelete = () => {
    if (!deleteConfirmReq) return;
    deleteRequirement(deleteConfirmReq.id);
    setDeleteConfirmReq(null);
    showToast('Requirement removed from marketplace.');
  };

  // ---------------------------------------------------------------------
  // VIEW: MY REQUIREMENTS ONLY
  // ---------------------------------------------------------------------
  if (view === 'requirements') {
    return (
      <div className="space-y-6 w-full">
        {toastMessage && (
          <div className="fixed bottom-6 right-6 z-50 bg-ink text-white px-4 py-3 rounded-2xl shadow-xl flex items-center gap-3 animate-in fade-in slide-in-from-bottom-5 duration-200 text-xs font-medium border border-zinc-700">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>{toastMessage}</span>
          </div>
        )}

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono uppercase font-semibold text-primary mb-1">
              <Briefcase className="w-3.5 h-3.5" />
              <span>Service Requirements Directory</span>
            </div>
            <h1 className="text-2xl font-extrabold text-ink tracking-tight">
              My Requirements
            </h1>
            <p className="text-xs text-ink-muted mt-1">
              All your posted service requirements, active proposals, and published listings.
            </p>
          </div>

          <Button
            size="md"
            icon={Plus}
            onClick={() => navigate('/client/requirements/new')}
          >
            Create Requirement
          </Button>
        </div>

        {/* Filters and Search Bar */}
        <div className="space-y-4 bg-white p-4 border border-border rounded-2xl shadow-xs">
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
            <button
              onClick={() => setActiveTab('all')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-medium transition-all whitespace-nowrap cursor-pointer ${
                activeTab === 'all'
                  ? 'bg-primary text-white shadow-xs font-bold'
                  : 'bg-bg text-ink-muted hover:text-ink border border-border'
              }`}
            >
              All Requirements ({myRequirements.length})
            </button>

            <button
              onClick={() => setActiveTab('active')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-medium transition-all whitespace-nowrap cursor-pointer ${
                activeTab === 'active'
                  ? 'bg-primary text-white shadow-xs font-bold'
                  : 'bg-bg text-ink-muted hover:text-ink border border-border'
              }`}
            >
              Active ({activeRequirementsCount})
            </button>

            <button
              onClick={() => setActiveTab('proposals')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-medium transition-all whitespace-nowrap cursor-pointer ${
                activeTab === 'proposals'
                  ? 'bg-primary text-white shadow-xs font-bold'
                  : 'bg-bg text-ink-muted hover:text-ink border border-border'
              }`}
            >
              Receiving Bids ({receivingProposalsCount})
            </button>

            <button
              onClick={() => setActiveTab('progress')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-medium transition-all whitespace-nowrap cursor-pointer ${
                activeTab === 'progress'
                  ? 'bg-primary text-white shadow-xs font-bold'
                  : 'bg-bg text-ink-muted hover:text-ink border border-border'
              }`}
            >
              In Progress ({inProgressContracts.length})
            </button>
          </div>

          <div className="flex flex-col sm:flex-row gap-2.5">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-zinc-400 pointer-events-none" />
              <Input
                type="text"
                placeholder="Search requirements by title or location..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-bg border border-border rounded-xl pl-9 pr-3 py-1.5 text-xs text-ink placeholder-zinc-400 focus:outline-none focus:border-primary transition-all"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-2.5 text-zinc-400 hover:text-zinc-600 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="bg-bg border border-border rounded-xl px-3 py-1.5 text-xs font-medium text-ink focus:outline-none focus:border-primary"
            >
              <option value="All">All Categories</option>
              {Array.from(
                new Set([
                  'Website Design',
                  'Mobile Development',
                  'Digital Marketing',
                  'Brand Identity',
                  'Software Development',
                  'Photography',
                  'Catering',
                  'DJ & Sound',
                  'Videography',
                  'Floral & Decor',
                  ...myRequirements.map((r) => r.category),
                ])
              ).map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Requirements Cards List */}
        {filteredRequirements.length === 0 ? (
          <div className="bg-white border border-border rounded-3xl p-12 text-center space-y-4 shadow-xs">
            <div className="w-16 h-16 rounded-2xl bg-emerald-50 text-primary flex items-center justify-center mx-auto">
              <Inbox className="w-8 h-8" />
            </div>
            <div className="max-w-md mx-auto space-y-1">
              <h3 className="text-base font-bold text-ink">
                No requirements found
              </h3>
              <p className="text-xs text-ink-muted">
                {searchQuery || categoryFilter !== 'All'
                  ? 'Try clearing your search term or category filter.'
                  : 'You have not posted any requirements matching this tab.'}
              </p>
            </div>
            <Button
              size="sm"
              icon={Plus}
              onClick={() => navigate('/client/requirements/new')}
            >
              Post New Requirement
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredRequirements.map((req) => {
              const reqProposals = proposals.filter((p) => p.requirementId === req.id);
              const activeContract = contracts.find((c) => c.requirementId === req.id);
              const isPaused = req.status === 'Draft' || req.isPaused;

              return (
                <div
                  key={req.id}
                  className="bg-white border border-border rounded-2xl p-5 hover:border-zinc-300 hover:shadow-md transition-all space-y-4"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge status={req.status} />
                        <span className="text-[11px] font-mono text-ink-muted">
                          ID: {req.id}
                        </span>
                        <span className="text-xs text-ink-muted">•</span>
                        <span className="text-xs font-semibold text-primary">
                          {req.category}
                        </span>
                        <span className="text-xs text-ink-muted">•</span>
                        <span className="text-[11px] text-ink-muted">
                          Posted {new Date(req.createdAt).toLocaleDateString()}
                        </span>
                      </div>

                      <h3
                        onClick={() => {
                          if (activeContract) {
                            navigate(`/contracts/${activeContract.id}`);
                          } else {
                            navigate(`/client/requirements/${req.id}`);
                          }
                        }}
                        className="text-base font-bold text-ink hover:text-primary cursor-pointer transition-colors"
                      >
                        {req.title}
                      </h3>
                    </div>

                    <div className="sm:text-right shrink-0">
                      <span className="block text-[10px] uppercase font-mono text-ink-muted">
                        Budget Range
                      </span>
                      <span className="text-sm font-extrabold text-ink">
                        ${req.budgetMin.toLocaleString()} - ${req.budgetMax.toLocaleString()}
                      </span>
                    </div>
                  </div>

                  <p className="text-xs text-ink-muted line-clamp-2 leading-relaxed">
                    {req.description}
                  </p>

                  <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-border text-xs text-ink-muted">
                    <div className="flex flex-wrap items-center gap-4">
                      <span className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-zinc-400" />
                        <span>{formatEventSchedule(req.eventDate, req.timingMode, req.eventStartTime, req.eventEndTime)}</span>
                      </span>

                      <span className="flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-zinc-400" />
                        <span>{req.location}</span>
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {activeContract ? (
                        <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 text-primary text-xs font-semibold border border-emerald-200">
                          Contract Active (${activeContract.amount.toLocaleString()})
                        </span>
                      ) : (
                        <span className="px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-900 text-xs font-semibold border border-amber-200">
                          {reqProposals.length} Bids Received
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions Row */}
                  <div className="pt-3 border-t border-border flex flex-wrap items-center justify-between gap-2 bg-bg/60 -mx-5 -mb-5 px-5 py-3 rounded-b-2xl">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          if (activeContract) {
                            navigate(`/contracts/${activeContract.id}`);
                          } else {
                            navigate(`/client/requirements/${req.id}`);
                          }
                        }}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white border border-border hover:border-zinc-300 text-xs font-semibold text-ink transition-all cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5 text-primary" />
                        <span>View Bids ({reqProposals.length})</span>
                      </button>

                      <button
                        onClick={() => openEditModal(req)}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white border border-border hover:border-zinc-300 text-xs font-medium text-ink transition-all cursor-pointer"
                      >
                        <Edit3 className="w-3.5 h-3.5 text-zinc-500" />
                        <span>Edit</span>
                      </button>

                      <button
                        onClick={() => {
                          togglePauseRequirement(req.id);
                          showToast(
                            isPaused
                              ? 'Requirement resumed & published on marketplace.'
                              : 'Requirement paused from receiving new bids.'
                          );
                        }}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white border border-border hover:border-zinc-300 text-xs font-medium text-ink transition-all cursor-pointer"
                      >
                        {isPaused ? (
                          <>
                            <Play className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Resume</span>
                          </>
                        ) : (
                          <>
                            <Pause className="w-3.5 h-3.5 text-amber-600" />
                            <span>Pause</span>
                          </>
                        )}
                      </button>
                    </div>

                    <button
                      onClick={() => setDeleteConfirmReq(req)}
                      className="flex items-center gap-1 px-2 py-1.5 rounded-lg hover:bg-rose-50 text-xs font-medium text-rose-600 transition-all cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Edit Modal */}
        {editModalReq && (
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white border border-border rounded-3xl max-w-lg w-full p-6 space-y-5 shadow-2xl">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <h3 className="text-base font-bold text-ink">
                  Edit Requirement
                </h3>
                <button
                  onClick={() => setEditModalReq(null)}
                  className="p-1 text-zinc-400 hover:text-zinc-700 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSaveEdit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-ink mb-1">
                    Title
                  </label>
                  <Input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="w-full bg-bg border border-border rounded-xl px-3 py-2 text-xs text-ink focus:outline-none focus:border-primary"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-ink mb-1">
                      Min Budget ($)
                    </label>
                    <Input
                      type="number"
                      value={editBudgetMin}
                      onChange={(e) => setEditBudgetMin(Number(e.target.value))}
                      className="w-full bg-bg border border-border rounded-xl px-3 py-2 text-xs text-ink focus:outline-none focus:border-primary"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-ink mb-1">
                      Max Budget ($)
                    </label>
                    <Input
                      type="number"
                      value={editBudgetMax}
                      onChange={(e) => setEditBudgetMax(Number(e.target.value))}
                      className="w-full bg-bg border border-border rounded-xl px-3 py-2 text-xs text-ink focus:outline-none focus:border-primary"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-ink mb-1">
                    Location
                  </label>
                  <Input
                    type="text"
                    value={editLocation}
                    onChange={(e) => setEditLocation(e.target.value)}
                    className="w-full bg-bg border border-border rounded-xl px-3 py-2 text-xs text-ink focus:outline-none focus:border-primary"
                    required
                  />
                </div>

                <div className="pt-3 border-t border-border flex items-center justify-end gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setEditModalReq(null)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" size="sm">
                    Save Changes
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {deleteConfirmReq && (
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white border border-border rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl">
              <h3 className="text-base font-bold text-rose-600">
                Delete Requirement?
              </h3>
              <p className="text-xs text-ink-muted">
                Are you sure you want to remove <strong>"{deleteConfirmReq.title}"</strong>?
              </p>
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-border">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDeleteConfirmReq(null)}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className="bg-rose-600 hover:bg-rose-700 text-white"
                  onClick={handleConfirmDelete}
                >
                  Delete Requirement
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ---------------------------------------------------------------------
  // VIEW: PROJECTS ONLY
  // ---------------------------------------------------------------------
  if (view === 'projects') {
    return (
      <div className="space-y-6 w-full">
        <div className="flex items-center justify-between border-b border-border pb-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono uppercase font-semibold text-primary mb-1">
              <FolderKanban className="w-3.5 h-3.5" />
              <span>Escrow & Contracts Management</span>
            </div>
            <h1 className="text-2xl font-extrabold text-ink tracking-tight">
              Active Projects
            </h1>
            <p className="text-xs text-ink-muted mt-1">
              Active bookings backed by simulated escrow protection and milestone verification.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {contracts.map((ctr) => (
            <Card key={ctr.id} className="p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <span className="text-xs font-mono font-bold text-primary">
                  REF: {ctr.acknowledgementNumber}
                </span>
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-primary text-[10px] font-extrabold">
                  {ctr.bookingState}
                </span>
              </div>

              <div>
                <h3 className="text-sm font-bold text-ink">
                  {ctr.requirementTitle}
                </h3>
                <p className="text-xs text-ink-muted">
                  Provider: <strong>{ctr.vendorName}</strong>
                </p>
              </div>

              <div className="p-3 rounded-xl bg-bg border border-border flex items-center justify-between text-xs">
                <div>
                  <span className="block text-[10px] text-ink-muted">Escrow Amount</span>
                  <span className="text-sm font-extrabold text-ink">
                    ${ctr.amount.toLocaleString()}
                  </span>
                </div>
                <Button
                  size="sm"
                  onClick={() => navigate(`/contracts/${ctr.id}`)}
                >
                  Manage Contract
                </Button>
              </div>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------
  // VIEW: SETTINGS
  // ---------------------------------------------------------------------
  if (view === 'settings') {
    return (
      <div className="space-y-6 max-w-4xl mx-auto">
        <div className="border-b border-border pb-4">
          <h1 className="text-2xl font-extrabold text-ink tracking-tight">
            Client Account Settings
          </h1>
          <p className="text-xs text-ink-muted mt-1">
            Configure notifications, escrow default parameters, and security preferences.
          </p>
        </div>

        <Card className="p-6 space-y-6">
          <div className="space-y-4">
            <h2 className="text-sm font-bold text-ink">Notification Preferences</h2>
            <div className="space-y-3 text-xs text-ink">
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" defaultChecked className="rounded text-primary" />
                <span>Receive instant alert when a vendor submits a proposal</span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" defaultChecked className="rounded text-primary" />
                <span>Send milestone release reminders 24h before event date</span>
              </label>
            </div>
          </div>

          <div className="pt-4 border-t border-border space-y-4">
            <h2 className="text-sm font-bold text-ink">Escrow Guarantee Policy</h2>
            <p className="text-xs text-ink-muted leading-relaxed">
              All Marché transactions lock payment in a zero-fee simulated escrow account until both Client and Provider confirm milestone completion.
            </p>
          </div>
        </Card>
      </div>
    );
  }

  // ---------------------------------------------------------------------
  // DEFAULT VIEW: CLIENT DASHBOARD
  // ---------------------------------------------------------------------
  const totalProposalsReceived = myRequirements.reduce((sum, r) => {
    return sum + proposals.filter((p) => p.requirementId === r.id).length;
  }, 0);

  const pendingProposalsCount = myRequirements.filter((r) => {
    const pCount = proposals.filter((p) => p.requirementId === r.id).length;
    const hasContract = contracts.some((c) => c.requirementId === r.id);
    return pCount > 0 && !hasContract;
  }).length;

  const handleDuplicateRequirement = (req: Requirement) => {
    createRequirement({
      title: `${req.title} (Copy)`,
      category: req.category,
      description: req.description,
      budgetMin: req.budgetMin,
      budgetMax: req.budgetMax,
      location: req.location,
      eventDate: req.eventDate,
      timingMode: req.timingMode,
      eventStartTime: req.eventStartTime,
      eventEndTime: req.eventEndTime,
      proposalDeadline: req.proposalDeadline,
      deliverables: req.deliverables,
    });
    showToast(`Requirement "${req.title}" duplicated.`);
  };

  // Generate insight line
  const getInsightText = () => {
    if (pendingProposalsCount > 0) {
      return `You have ${pendingProposalsCount} proposal${pendingProposalsCount > 1 ? 's' : ''} waiting for review.`;
    }
    if (inProgressContracts.length > 0) {
      return `You have ${inProgressContracts.length} active project${inProgressContracts.length > 1 ? 's' : ''} in progress.`;
    }
    if (activeRequirementsCount > 0) {
      return `You have ${activeRequirementsCount} requirement${activeRequirementsCount > 1 ? 's' : ''} active on the marketplace.`;
    }
    return 'Get started by creating your first service requirement.';
  };

  return (
    <div className="space-y-5 w-full transition-all">
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-ink text-white px-4 py-3 rounded-2xl shadow-xl flex items-center gap-3 animate-in fade-in slide-in-from-bottom-5 duration-200 text-xs font-medium border border-zinc-700">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-0.5">
          <div className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">
            Dashboard Overview
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-ink tracking-tight">
            Good Morning, {currentUser.name.split(' ')[0]} 👋
          </h1>
          <p className="text-xs font-medium text-ink-muted">
            {getInsightText()}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => navigate('/client/requirements/new')}
            className="flex items-center gap-2 px-3.5 py-2 bg-primary text-white hover:bg-primary-hover rounded-xl text-xs font-bold transition-all shadow-2xs hover:shadow-xs cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Create Requirement</span>
          </button>
        </div>
      </div>

      {/* Compact KPI Cards Grid (4 cards in a single row on desktop) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Active Requirements */}
        <div
          onClick={() => navigate('/client/requirements')}
          className="bg-white p-3.5 sm:p-4 rounded-xl border border-border hover:border-zinc-300 hover:shadow-2xs transition-all cursor-pointer space-y-1.5 group"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-ink-muted">Active Requirements</span>
            <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200/50">
              Active
            </span>
          </div>
          <div className="flex items-baseline justify-between">
            <p className="text-2xl font-extrabold text-ink group-hover:text-primary transition-colors">
              {activeRequirementsCount}
            </p>
            <span className="text-[11px] text-ink-muted">
              {activeRequirementsCount === 1 ? '1 brief' : `${activeRequirementsCount} briefs`}
            </span>
          </div>
        </div>

        {/* New Proposals */}
        <div
          onClick={() => navigate('/client/requirements')}
          className="bg-white p-3.5 sm:p-4 rounded-xl border border-border hover:border-zinc-300 hover:shadow-2xs transition-all cursor-pointer space-y-1.5 group"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-ink-muted">New Proposals</span>
            <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200/50">
              {pendingProposalsCount > 0 ? `${pendingProposalsCount} pending` : 'Reviewed'}
            </span>
          </div>
          <div className="flex items-baseline justify-between">
            <p className="text-2xl font-extrabold text-ink group-hover:text-primary transition-colors">
              {totalProposalsReceived}
            </p>
            <span className="text-[11px] text-ink-muted">
              Received
            </span>
          </div>
        </div>

        {/* Active Projects */}
        <div
          onClick={() => navigate('/client/projects')}
          className="bg-white p-3.5 sm:p-4 rounded-xl border border-border hover:border-zinc-300 hover:shadow-2xs transition-all cursor-pointer space-y-1.5 group"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-ink-muted">Active Projects</span>
            <span className="text-[10px] font-semibold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200/50">
              In progress
            </span>
          </div>
          <div className="flex items-baseline justify-between">
            <p className="text-2xl font-extrabold text-ink group-hover:text-primary transition-colors">
              {inProgressContracts.length}
            </p>
            <span className="text-[11px] text-ink-muted">
              Active
            </span>
          </div>
        </div>

        {/* Completed Projects */}
        <div
          onClick={() => navigate('/client/projects')}
          className="bg-white p-3.5 sm:p-4 rounded-xl border border-border hover:border-zinc-300 hover:shadow-2xs transition-all cursor-pointer space-y-1.5 group"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-ink-muted">Completed Projects</span>
            <span className="text-[10px] font-semibold text-zinc-700 bg-zinc-100 px-1.5 py-0.5 rounded border border-zinc-200/60">
              Delivered
            </span>
          </div>
          <div className="flex items-baseline justify-between">
            <p className="text-2xl font-extrabold text-ink group-hover:text-primary transition-colors">
              {completedContracts.length}
            </p>
            <span className="text-[11px] text-ink-muted">
              Delivered
            </span>
          </div>
        </div>
      </div>

      {/* Main Content Side-By-Side Split Grid on Desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left Column: Needs Your Attention */}
        <div className="lg:col-span-5 bg-white border border-border rounded-2xl p-4 sm:p-5 shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              <h2 className="text-base font-extrabold text-ink tracking-tight">
                Needs Your Attention
              </h2>
            </div>
            <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[11px] font-bold font-mono">
              {attentionItems.length}
            </span>
          </div>

          {attentionItems.length === 0 ? (
            <div className="py-8 px-4 text-center space-y-2 bg-bg/60 rounded-xl border border-border">
              <CheckCircle2 className="w-7 h-7 text-primary mx-auto" />
              <h3 className="text-xs font-bold text-ink">All Clear!</h3>
              <p className="text-[11px] text-ink-muted">
                No pending proposals or escrow actions require your attention today.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1">
              {attentionItems.map((item) => (
                <div
                  key={item.id}
                  className="p-3.5 rounded-xl border border-border bg-bg/60 hover:bg-white hover:border-zinc-300 transition-all flex flex-col justify-between gap-3"
                >
                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${item.badgeColor}`}
                      >
                        {item.badgeText}
                      </span>
                      <span className="text-[10px] text-ink-muted">Action Required</span>
                    </div>
                    <h3 className="text-xs font-bold text-ink line-clamp-1">
                      {item.title}
                    </h3>
                    <p className="text-[11px] text-ink-muted line-clamp-2">
                      {item.description}
                    </p>
                  </div>

                  <button
                    onClick={item.onAction}
                    className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 bg-primary text-white hover:bg-primary-hover rounded-lg text-xs font-bold transition-all cursor-pointer shadow-2xs"
                  >
                    <span>{item.actionLabel}</span>
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right Column: Recent Requirements */}
        <div className="lg:col-span-7 bg-white border border-border rounded-2xl p-4 sm:p-5 shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <div>
              <h2 className="text-base font-extrabold text-ink tracking-tight">
                Recent Requirements
              </h2>
            </div>
            <button
              onClick={() => navigate('/client/requirements')}
              className="text-xs font-semibold text-primary hover:underline flex items-center gap-1 cursor-pointer"
            >
              <span>View All ({myRequirements.length})</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {myRequirements.length === 0 ? (
            <div className="py-8 px-4 text-center space-y-2 bg-bg/60 rounded-xl border border-border">
              <Briefcase className="w-7 h-7 text-zinc-400 mx-auto" />
              <div className="space-y-0.5">
                <h3 className="text-xs font-bold text-ink">No Requirements Yet</h3>
                <p className="text-[11px] text-ink-muted">
                  Post a service requirement to start receiving proposals.
                </p>
              </div>
              <Button
                size="sm"
                icon={Plus}
                onClick={() => navigate('/client/requirements/new')}
              >
                Create Requirement
              </Button>
            </div>
          ) : (
            <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1">
              {myRequirements.slice(0, 4).map((req) => {
                const pCount = proposals.filter((p) => p.requirementId === req.id).length;
                const isMenuOpen = activeMenuReqId === req.id;

                return (
                  <div
                    key={req.id}
                    className="p-3.5 rounded-xl border border-border bg-white hover:border-zinc-300 transition-all flex items-center justify-between gap-3 relative"
                  >
                    {/* Information */}
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          onClick={() => navigate(`/client/requirements/${req.id}`)}
                          className="text-xs font-bold text-ink hover:text-primary transition-colors cursor-pointer truncate max-w-[220px] sm:max-w-none"
                        >
                          {req.title}
                        </span>
                        <span
                          className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${
                            req.status === 'Paused'
                              ? 'bg-amber-50 text-amber-800 border-amber-200'
                              : 'bg-emerald-50 text-primary border-emerald-200'
                          }`}
                        >
                          {req.status}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 text-[11px] text-ink-muted flex-wrap">
                        <span className="font-semibold text-ink">{req.category}</span>
                        <span>•</span>
                        <span>Budget: <strong className="text-ink">${req.budgetMin.toLocaleString()} - ${req.budgetMax.toLocaleString()}</strong></span>
                        <span>•</span>
                        <span><strong className="text-ink">{pCount}</strong> proposal{pCount !== 1 ? 's' : ''}</span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1.5 shrink-0 relative">
                      <button
                        onClick={() => navigate(`/client/requirements/${req.id}`)}
                        className="px-3 py-1.5 bg-primary text-white hover:bg-primary-hover rounded-lg text-xs font-bold transition-all cursor-pointer shadow-2xs"
                      >
                        View
                      </button>

                      <div className="relative">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveMenuReqId(isMenuOpen ? null : req.id);
                          }}
                          className="px-2 py-1.5 text-zinc-600 hover:text-zinc-900 hover:bg-surface-subtle rounded-lg transition-colors cursor-pointer border border-border bg-white flex items-center justify-center"
                          title="More options"
                        >
                          <span className="text-[10px] font-bold tracking-widest leading-none">•••</span>
                        </button>

                        {isMenuOpen && (
                          <>
                            <div
                              className="fixed inset-0 z-40"
                              onClick={() => setActiveMenuReqId(null)}
                            />
                            <div className="absolute right-0 mt-1 w-40 bg-white rounded-xl shadow-xl border border-border py-1 z-50 text-xs text-ink animate-in fade-in zoom-in-95 duration-150">
                              <button
                                onClick={() => {
                                  setActiveMenuReqId(null);
                                  openEditModal(req);
                                }}
                                className="w-full text-left px-3.5 py-2 hover:bg-bg flex items-center gap-2 font-medium"
                              >
                                <Edit3 className="w-3.5 h-3.5 text-zinc-500" />
                                <span>Edit</span>
                              </button>

                              <button
                                onClick={() => {
                                  setActiveMenuReqId(null);
                                  togglePauseRequirement(req.id);
                                  showToast(
                                    req.status === 'Paused'
                                      ? `Requirement "${req.title}" resumed.`
                                      : `Requirement "${req.title}" paused.`
                                  );
                                }}
                                className="w-full text-left px-3.5 py-2 hover:bg-bg flex items-center gap-2 font-medium"
                              >
                                {req.status === 'Paused' ? (
                                  <>
                                    <Play className="w-3.5 h-3.5 text-emerald-600" />
                                    <span>Resume</span>
                                  </>
                                ) : (
                                  <>
                                    <Pause className="w-3.5 h-3.5 text-amber-600" />
                                    <span>Pause</span>
                                  </>
                                )}
                              </button>

                              <button
                                onClick={() => {
                                  setActiveMenuReqId(null);
                                  handleDuplicateRequirement(req);
                                }}
                                className="w-full text-left px-3.5 py-2 hover:bg-bg flex items-center gap-2 font-medium"
                              >
                                <Sparkles className="w-3.5 h-3.5 text-zinc-500" />
                                <span>Duplicate</span>
                              </button>

                              <div className="my-1 border-t border-border" />

                              <button
                                onClick={() => {
                                  setActiveMenuReqId(null);
                                  setDeleteConfirmReq(req);
                                }}
                                className="w-full text-left px-3.5 py-2 hover:bg-rose-50 text-rose-600 flex items-center gap-2 font-medium"
                              >
                                <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                                <span>Delete</span>
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {deleteConfirmReq && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 space-y-4 shadow-xl border border-border">
            <div className="space-y-1">
              <h3 className="text-base font-bold text-ink">Delete Requirement?</h3>
              <p className="text-xs text-ink-muted">
                Are you sure you want to delete "{deleteConfirmReq.title}"? This action cannot be undone.
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDeleteConfirmReq(null)}
              >
                Cancel
              </Button>
              <button
                onClick={handleConfirmDelete}
                className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Requirement Modal */}
      {editModalReq && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-xl border border-border">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="text-sm font-bold text-ink">Edit Requirement</h3>
              <button
                onClick={() => setEditModalReq(null)}
                className="p-1 text-zinc-400 hover:text-zinc-700 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-ink mb-1">Title</label>
                <Input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full bg-bg border border-border rounded-xl px-3 py-2 text-xs text-ink focus:outline-none focus:border-primary"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-ink mb-1">Min Budget ($)</label>
                  <Input
                    type="number"
                    value={editBudgetMin}
                    onChange={(e) => setEditBudgetMin(Number(e.target.value))}
                    className="w-full bg-bg border border-border rounded-xl px-3 py-2 text-xs text-ink focus:outline-none focus:border-primary"
                    required
                  />
                </div>
                <div>
                  <label className="block font-bold text-ink mb-1">Max Budget ($)</label>
                  <Input
                    type="number"
                    value={editBudgetMax}
                    onChange={(e) => setEditBudgetMax(Number(e.target.value))}
                    className="w-full bg-bg border border-border rounded-xl px-3 py-2 text-xs text-ink focus:outline-none focus:border-primary"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-ink mb-1">Location</label>
                <Input
                  type="text"
                  value={editLocation}
                  onChange={(e) => setEditLocation(e.target.value)}
                  className="w-full bg-bg border border-border rounded-xl px-3 py-2 text-xs text-ink focus:outline-none focus:border-primary"
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setEditModalReq(null)}
                >
                  Cancel
                </Button>
                <Button type="submit" size="sm">
                  Save Changes
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};


