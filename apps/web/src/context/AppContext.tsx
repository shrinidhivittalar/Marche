import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  User,
  UserRole,
  Job,
  Proposal,
  Contract,
  AuditLogEntry,
  Notification,
  ChatMessage,
  BookingState,
  EventCategory,
} from '../types';
import {
  DEMO_USERS,
  INITIAL_JOBS,
  INITIAL_PROPOSALS,
  INITIAL_CONTRACTS,
  INITIAL_AUDIT_LOGS,
  INITIAL_NOTIFICATIONS,
  INITIAL_MESSAGES,
  INITIAL_TALENT,
} from '../data/mockData';
import { deriveSlotFromEvent, isVendorSlotAvailable, markVendorSlotBooked } from '../lib/availability';
import { isBidWithinBudget } from '../lib/formatBudget';

type JobDraftInput = Omit<
  Job,
  | 'id'
  | 'clientId'
  | 'clientName'
  | 'clientAvatar'
  | 'clientCompany'
  | 'clientVerified'
  | 'proposalsCount'
  | 'createdAt'
  | 'status'
  | 'isDraftPost'
>;

// The only fields a client can edit on an already-published job — status/proposalsCount/
// isDraftPost etc. must only ever change via the dedicated transition functions
// (hireVendor, vendorMarkCompleted, togglePauseJob, ...), not through a generic update.
type EditableJobFields = Pick<Job, 'title' | 'budgetMin' | 'budgetMax' | 'location'>;

interface AppContextType {
  currentUser: User;
  setCurrentUserRole: (role: UserRole) => void;
  updateCurrentUser: (updates: Partial<User>) => void;
  route: string;
  navigate: (path: string) => void;
  goBack: () => void;
  jobs: Job[];
  proposals: Proposal[];
  contracts: Contract[];
  auditLogs: AuditLogEntry[];
  notifications: Notification[];
  messages: ChatMessage[];
  favoriteConversationIds: string[];
  toggleFavoriteConversation: (contractId: string) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  selectedCategoryFilter: string;
  setSelectedCategoryFilter: (cat: string) => void;
  selectedLocationFilter: string;
  setSelectedLocationFilter: (loc: string) => void;
  
  // Actions
  createJob: (data: JobDraftInput) => Job;
  saveJobDraft: (draftId: string | null, data: JobDraftInput) => Job;
  publishJobDraft: (draftId: string, data: JobDraftInput) => Job;

  submitProposal: (
    data: {
      jobId: string;
      bidAmount: number;
      coverLetter: string;
      estimatedDelivery: string;
      proposedStartTime?: string;
      proposedEndTime?: string;
      milestones: { title: string; amount: number; description: string }[];
      portfolioLinks?: string[];
      draftId?: string;
    }
  ) => Proposal;

  saveProposalDraft: (
    draftId: string | null,
    data: {
      jobId: string;
      bidAmount: number;
      coverLetter: string;
      estimatedDelivery: string;
      proposedStartTime?: string;
      proposedEndTime?: string;
      milestones: { title: string; amount: number; description: string }[];
      portfolioLinks?: string[];
    }
  ) => Proposal;

  hireVendor: (
    jobId: string,
    proposalId: string
  ) => { contract: Contract };

  vendorMarkCompleted: (contractId: string) => void;
  clientConfirmCompletion: (contractId: string) => void;
  adminOverrideBookingState: (
    bookingId: string,
    targetState: BookingState,
    reason: string
  ) => void;
  
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  sendMessage: (contractId: string, text: string) => void;
  markMessagesRead: (contractId: string) => void;
  
  // Job quick actions
  togglePauseJob: (id: string) => void;
  deleteJob: (id: string) => void;
  updateJob: (id: string, updates: Partial<EditableJobFields>) => void;
  
  // Helper helpers
  getJobById: (id: string) => Job | undefined;
  getProposalsForJob: (reqId: string) => Proposal[];
  getContractByJobId: (reqId: string) => Contract | undefined;
  getContractById: (contractId: string) => Contract | undefined;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const LOCAL_STORAGE_KEY = 'marche_app_state_v8';
const ACK_NUMBER_MIN = 1000;
const ACK_NUMBER_RANGE = 9000; // yields a random 4-digit suffix (1000-9999)

// Timestamp alone can collide if two records are created in the same millisecond;
// the random suffix (matching the pattern already used for notifications) avoids that.
function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`;
}

// Fixed-budget jobs must keep max mirrored to min so provider bid validation stays
// consistent — enforced once here instead of separately in every place a job is
// created or edited.
function normalizeJobBudget<T extends { budgetMode: 'fixed' | 'range'; budgetMin: number; budgetMax: number }>(
  data: T
): T {
  return data.budgetMode === 'fixed' ? { ...data, budgetMax: data.budgetMin } : data;
}

function loadUserWithOverrides(role: UserRole): User {
  const base = DEMO_USERS[role];
  const saved = localStorage.getItem(`${LOCAL_STORAGE_KEY}_profile_${role}`);
  return saved ? { ...base, ...JSON.parse(saved) } : base;
}

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User>(() => {
    const saved = localStorage.getItem(`${LOCAL_STORAGE_KEY}_user_role`);
    const isUserRole = (value: string | null): value is UserRole =>
      value === 'client' || value === 'vendor' || value === 'admin';
    return loadUserWithOverrides(isUserRole(saved) ? saved : 'client');
  });

  const [route, setRoute] = useState<string>(() => {
    return window.location.pathname && window.location.pathname !== '/'
      ? window.location.pathname
      : '/';
  });

  const [jobs, setJobs] = useState<Job[]>(() => {
    const saved = localStorage.getItem(`${LOCAL_STORAGE_KEY}_jobs`);
    return saved ? JSON.parse(saved) : INITIAL_JOBS;
  });

  const [proposals, setProposals] = useState<Proposal[]>(() => {
    const saved = localStorage.getItem(`${LOCAL_STORAGE_KEY}_proposals`);
    return saved ? JSON.parse(saved) : INITIAL_PROPOSALS;
  });

  const [contracts, setContracts] = useState<Contract[]>(() => {
    const saved = localStorage.getItem(`${LOCAL_STORAGE_KEY}_contracts`);
    return saved ? JSON.parse(saved) : INITIAL_CONTRACTS;
  });

  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>(() => {
    const saved = localStorage.getItem(`${LOCAL_STORAGE_KEY}_audit`);
    return saved ? JSON.parse(saved) : INITIAL_AUDIT_LOGS;
  });

  const [notifications, setNotifications] = useState<Notification[]>(() => {
    const saved = localStorage.getItem(`${LOCAL_STORAGE_KEY}_notifications`);
    return saved ? JSON.parse(saved) : INITIAL_NOTIFICATIONS;
  });

  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const saved = localStorage.getItem(`${LOCAL_STORAGE_KEY}_messages`);
    return saved ? JSON.parse(saved) : INITIAL_MESSAGES;
  });

  const [favoriteConversationIds, setFavoriteConversationIds] = useState<string[]>(() => {
    const saved = localStorage.getItem(`${LOCAL_STORAGE_KEY}_favorite_conversations`);
    return saved ? JSON.parse(saved) : [];
  });

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('All');
  const [selectedLocationFilter, setSelectedLocationFilter] = useState<string>('All');

  // Sync state to local storage
  useEffect(() => {
    localStorage.setItem(`${LOCAL_STORAGE_KEY}_user_role`, currentUser.role);
    localStorage.setItem(`${LOCAL_STORAGE_KEY}_jobs`, JSON.stringify(jobs));
    localStorage.setItem(`${LOCAL_STORAGE_KEY}_proposals`, JSON.stringify(proposals));
    localStorage.setItem(`${LOCAL_STORAGE_KEY}_contracts`, JSON.stringify(contracts));
    localStorage.setItem(`${LOCAL_STORAGE_KEY}_audit`, JSON.stringify(auditLogs));
    localStorage.setItem(`${LOCAL_STORAGE_KEY}_notifications`, JSON.stringify(notifications));
    localStorage.setItem(`${LOCAL_STORAGE_KEY}_messages`, JSON.stringify(messages));
    localStorage.setItem(
      `${LOCAL_STORAGE_KEY}_favorite_conversations`,
      JSON.stringify(favoriteConversationIds),
    );
  }, [currentUser, jobs, proposals, contracts, auditLogs, notifications, messages, favoriteConversationIds]);

  // Handle popstate for back/forward navigation
  useEffect(() => {
    const handlePopState = () => {
      setRoute(window.location.pathname || '/');
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigate = (path: string) => {
    setRoute(path);
    window.history.pushState({}, '', path);
    window.scrollTo(0, 0);
  };

  const goBack = () => {
    window.history.back();
  };

  const setCurrentUserRole = (role: UserRole) => {
    if (DEMO_USERS[role]) {
      setCurrentUser(loadUserWithOverrides(role));
      if (role === 'client') {
        navigate('/client/dashboard');
      } else if (role === 'vendor') {
        navigate('/provider/dashboard');
      } else if (role === 'admin') {
        navigate('/admin/audit');
      }
    }
  };

  const updateCurrentUser = (updates: Partial<User>) => {
    setCurrentUser((prev) => {
      const savedRaw = localStorage.getItem(`${LOCAL_STORAGE_KEY}_profile_${prev.role}`);
      const savedOverrides = savedRaw ? JSON.parse(savedRaw) : {};
      localStorage.setItem(
        `${LOCAL_STORAGE_KEY}_profile_${prev.role}`,
        JSON.stringify({ ...savedOverrides, ...updates }),
      );
      return { ...prev, ...updates };
    });
  };

  const addAuditLog = (
    action: string,
    targetEntity: string,
    beforeState?: string,
    afterState?: string,
    reason?: string
  ) => {
    const newLog: AuditLogEntry = {
      id: generateId('log'),
      timestamp: new Date().toISOString(),
      actorId: currentUser.id,
      actorName: currentUser.name,
      actorRole: currentUser.role,
      action,
      targetEntity,
      beforeState,
      afterState,
      reason,
    };
    setAuditLogs((prev) => [newLog, ...prev]);
  };

  const addNotification = (
    userId: string,
    title: string,
    message: string,
    type: 'proposal' | 'contract' | 'system' | 'job_alert',
    linkRoute?: string
  ) => {
    const notif: Notification = {
      id: generateId('notif'),
      userId,
      title,
      message,
      type,
      read: false,
      timestamp: new Date().toISOString(),
      linkRoute,
    };
    setNotifications((prev) => [notif, ...prev]);
  };

  // Notifies every vendor in the talent directory whose category matches the new job,
  // instead of a single hardcoded vendor id regardless of fit.
  const notifyMatchingVendors = (job: Job) => {
    const matchingVendors = INITIAL_TALENT.filter((v) => v.category === job.category);
    matchingVendors.forEach((vendor) => {
      addNotification(
        vendor.id,
        'New Matching Job',
        `New job posted in ${job.category}: "${job.title}"`,
        'job_alert',
        `/provider/jobs/${job.id}`
      );
    });
  };

  // Shared "new job" base fields between createJob/saveJobDraft's create branches.
  const buildNewJobBase = () => ({
    clientId: currentUser.id,
    clientName: currentUser.name,
    clientAvatar: currentUser.avatar,
    clientCompany: currentUser.companyOrTitle,
    clientVerified: currentUser.verified,
    proposalsCount: 0,
    createdAt: new Date().toISOString(),
  });

  // 1. Create Job
  const createJob = (data: JobDraftInput): Job => {
    const newReqId = generateId('job');
    const newReq: Job = {
      ...normalizeJobBudget(data),
      id: newReqId,
      ...buildNewJobBase(),
      status: 'Open', // Active for proposals
    };

    setJobs((prev) => [newReq, ...prev]);

    addAuditLog(
      'Job Published',
      `Job ${newReq.id} ("${newReq.title}")`,
      'Draft',
      'Open'
    );

    notifyMatchingVendors(newReq);

    return newReq;
  };

  // 1b. Save Job Draft (create a new draft, or update an existing one in place)
  const saveJobDraft = (draftId: string | null, data: JobDraftInput): Job => {
    if (draftId) {
      const existing = jobs.find((r) => r.id === draftId);
      if (!existing) throw new Error('Draft not found');
      const updated: Job = { ...existing, ...normalizeJobBudget(data), status: 'Draft', isDraftPost: true };
      setJobs((prev) => prev.map((r) => (r.id === draftId ? updated : r)));
      return updated;
    }

    const newReqId = generateId('job');
    const newReq: Job = {
      ...normalizeJobBudget(data),
      id: newReqId,
      ...buildNewJobBase(),
      status: 'Draft',
      isDraftPost: true,
    };

    setJobs((prev) => [newReq, ...prev]);
    addAuditLog('Job Draft Saved', `Job ${newReqId} ("${newReq.title || 'Untitled job'}")`, 'None', 'Draft');

    return newReq;
  };

  // 1c. Publish an existing Job Draft
  const publishJobDraft = (draftId: string, data: JobDraftInput): Job => {
    const existing = jobs.find((r) => r.id === draftId);
    if (!existing) throw new Error('Draft not found');

    const published: Job = { ...existing, ...normalizeJobBudget(data), status: 'Open', isDraftPost: false };
    setJobs((prev) => prev.map((r) => (r.id === draftId ? published : r)));

    addAuditLog('Job Published', `Job ${draftId} ("${published.title}")`, 'Draft', 'Open');

    notifyMatchingVendors(published);

    return published;
  };

  // Shared by submitProposal/saveProposalDraft's four create/update branches, so the vendor
  // snapshot fields (and their magic fallback defaults) and milestone-id mapping only exist
  // in one place instead of drifting across four copies.
  const buildVendorSnapshot = (targetReq: Job | undefined) => ({
    vendorId: currentUser.id,
    vendorName: currentUser.name,
    vendorAvatar: currentUser.avatar,
    vendorRating: currentUser.rating || 4.95,
    vendorReviewCount: currentUser.reviewCount || 12,
    vendorCategory: (targetReq?.category || 'Photography') as EventCategory,
    vendorLocation: currentUser.location || 'Mumbai, Maharashtra',
  });

  const buildMilestones = (
    proposalId: string,
    milestones: { title: string; amount: number; description: string }[]
  ) =>
    milestones.map((m, idx) => ({
      id: `ms_${proposalId}_${idx}`,
      title: m.title,
      amount: m.amount,
      description: m.description,
    }));

  // 2. Submit Proposal
  const submitProposal = (data: {
    jobId: string;
    bidAmount: number;
    coverLetter: string;
    estimatedDelivery: string;
    proposedStartTime?: string;
    proposedEndTime?: string;
    milestones: { title: string; amount: number; description: string }[];
    portfolioLinks?: string[];
    draftId?: string;
  }): Proposal => {
    const targetReq = jobs.find((r) => r.id === data.jobId);
    if (targetReq && targetReq.status !== 'Open') {
      throw new Error('This job is no longer accepting proposals.');
    }
    if (targetReq && !isBidWithinBudget(targetReq, data.bidAmount)) {
      throw new Error("Bid amount is outside the client's allowed budget range.");
    }
    let newProposal: Proposal;

    if (data.draftId) {
      const existing = proposals.find((p) => p.id === data.draftId);
      if (!existing) throw new Error('Draft not found');
      newProposal = {
        ...existing,
        bidAmount: data.bidAmount,
        coverLetter: data.coverLetter,
        estimatedDelivery: data.estimatedDelivery,
        proposedStartTime: data.proposedStartTime,
        proposedEndTime: data.proposedEndTime,
        milestones: buildMilestones(existing.id, data.milestones),
        status: 'submitted',
        submittedAt: new Date().toISOString(),
        portfolioLinks: data.portfolioLinks,
      };
      setProposals((prev) => prev.map((p) => (p.id === data.draftId ? newProposal : p)));
    } else {
      const newPropId = generateId('prop');
      newProposal = {
        id: newPropId,
        jobId: data.jobId,
        ...buildVendorSnapshot(targetReq),
        bidAmount: data.bidAmount,
        coverLetter: data.coverLetter,
        estimatedDelivery: data.estimatedDelivery,
        proposedStartTime: data.proposedStartTime,
        proposedEndTime: data.proposedEndTime,
        milestones: buildMilestones(newPropId, data.milestones),
        status: 'submitted',
        submittedAt: new Date().toISOString(),
        portfolioLinks: data.portfolioLinks,
      };
      setProposals((prev) => [newProposal, ...prev]);
    }

    // Increment proposals count on job
    setJobs((prev) =>
      prev.map((r) =>
        r.id === data.jobId ? { ...r, proposalsCount: r.proposalsCount + 1 } : r
      )
    );

    addAuditLog(
      'Proposal Submitted',
      `Proposal ${newProposal.id} for Job ${data.jobId}`,
      'None',
      `Submitted (₹${data.bidAmount.toLocaleString('en-IN')})`
    );

    if (targetReq) {
      addNotification(
        targetReq.clientId,
        'New Proposal Received',
        `${currentUser.name} submitted a proposal (₹${data.bidAmount.toLocaleString('en-IN')}) for "${targetReq.title}"`,
        'proposal',
        `/client/jobs/${targetReq.id}`
      );
    }

    return newProposal;
  };

  // 2b. Save Proposal Draft (create a new draft, or update an existing one in place)
  const saveProposalDraft = (
    draftId: string | null,
    data: {
      jobId: string;
      bidAmount: number;
      coverLetter: string;
      estimatedDelivery: string;
      proposedStartTime?: string;
      proposedEndTime?: string;
      milestones: { title: string; amount: number; description: string }[];
      portfolioLinks?: string[];
    }
  ): Proposal => {
    if (draftId) {
      const existing = proposals.find((p) => p.id === draftId);
      if (!existing) throw new Error('Draft not found');
      const updated: Proposal = {
        ...existing,
        bidAmount: data.bidAmount,
        coverLetter: data.coverLetter,
        estimatedDelivery: data.estimatedDelivery,
        proposedStartTime: data.proposedStartTime,
        proposedEndTime: data.proposedEndTime,
        milestones: buildMilestones(existing.id, data.milestones),
        status: 'draft',
        portfolioLinks: data.portfolioLinks,
      };
      setProposals((prev) => prev.map((p) => (p.id === draftId ? updated : p)));
      return updated;
    }

    const newPropId = generateId('prop');
    const targetReq = jobs.find((r) => r.id === data.jobId);
    const newProposal: Proposal = {
      id: newPropId,
      jobId: data.jobId,
      ...buildVendorSnapshot(targetReq),
      bidAmount: data.bidAmount,
      coverLetter: data.coverLetter,
      estimatedDelivery: data.estimatedDelivery,
      proposedStartTime: data.proposedStartTime,
      proposedEndTime: data.proposedEndTime,
      milestones: buildMilestones(newPropId, data.milestones),
      status: 'draft',
      submittedAt: new Date().toISOString(),
      portfolioLinks: data.portfolioLinks,
    };
    setProposals((prev) => [newProposal, ...prev]);
    return newProposal;
  };

  // 3. Hire Vendor & Confirm Booking
  const hireVendor = (
    jobId: string,
    proposalId: string
  ): { contract: Contract } => {
    const req = jobs.find((r) => r.id === jobId);
    const prop = proposals.find((p) => p.id === proposalId);

    if (!req || !prop) {
      throw new Error('Job or proposal not found');
    }

    const slot = deriveSlotFromEvent(req.timingMode, req.eventStartTime);
    if (!isVendorSlotAvailable(prop.vendorId, req.eventDate, slot)) {
      throw new Error('This vendor is no longer available on the selected date.');
    }

    const contractId = generateId('ctr');
    const ackNumber = `MARCHE-ACK-${new Date().getFullYear()}-${Math.floor(ACK_NUMBER_MIN + Math.random() * ACK_NUMBER_RANGE)}`;

    const newContract: Contract = {
      id: contractId,
      jobId: req.id,
      jobTitle: req.title,
      category: req.category,
      clientId: req.clientId,
      clientName: req.clientName,
      clientAvatar: req.clientAvatar,
      vendorId: prop.vendorId,
      vendorName: prop.vendorName,
      vendorAvatar: prop.vendorAvatar,
      proposalId: prop.id,
      amount: prop.bidAmount,
      eventDate: req.eventDate,
      timingMode: req.timingMode,
      eventStartTime: req.eventStartTime,
      eventEndTime: req.eventEndTime,
      location: req.location,
      bookingState: 'Confirmed',
      createdAt: new Date().toISOString(),
      acknowledgementNumber: ackNumber,
    };

    // Update contract state
    setContracts((prev) => [newContract, ...prev]);

    // Auto-block the vendor's availability calendar for the confirmed event slot
    markVendorSlotBooked(
      prop.vendorId,
      req.eventDate,
      slot,
    );

    // Update proposal state
    setProposals((prev) =>
      prev.map((p) => {
        if (p.id === proposalId) return { ...p, status: 'accepted' };
        if (p.jobId === jobId) return { ...p, status: 'declined' };
        return p;
      })
    );

    // Update job state
    setJobs((prev) =>
      prev.map((r) =>
        r.id === jobId ? { ...r, status: 'Confirmed' } : r
      )
    );

    // Write audit log
    addAuditLog(
      'Vendor Hired & Contract Confirmed',
      `Contract ${contractId} with ${prop.vendorName}`,
      'Open',
      'Confirmed'
    );

    // Notifications
    addNotification(
      prop.vendorId,
      'You Have Been Hired!',
      `Congratulations! ${req.clientName} accepted your proposal (₹${prop.bidAmount.toLocaleString('en-IN')}) for "${req.title}". Your booking is confirmed.`,
      'contract',
      `/contracts/${contractId}`
    );

    return { contract: newContract };
  };

  // 4. Vendor Marks Event Completed
  const vendorMarkCompleted = (contractId: string) => {
    const ctr = contracts.find((c) => c.id === contractId);
    if (!ctr || ctr.bookingState !== 'Confirmed') return;

    setContracts((prev) =>
      prev.map((c) =>
        c.id === contractId
          ? {
              ...c,
              bookingState: 'Completed',
              vendorCompletedAt: new Date().toISOString(),
            }
          : c
      )
    );

    setJobs((prev) =>
      prev.map((r) =>
        r.id === ctr.jobId ? { ...r, status: 'Completed' } : r
      )
    );

    addAuditLog(
      'Vendor Marked Event Completed',
      `Contract ${contractId}`,
      'Confirmed',
      'Completed'
    );

    addNotification(
      ctr.clientId,
      'Event Marked Delivered',
      `${ctr.vendorName} marked the event "${ctr.jobTitle}" as completed. Please confirm to close out the booking.`,
      'contract',
      `/contracts/${contractId}`
    );
  };

  // 5. Client Confirms Completion
  const clientConfirmCompletion = (contractId: string) => {
    const ctr = contracts.find((c) => c.id === contractId);
    if (!ctr || ctr.bookingState !== 'Completed') return;

    setContracts((prev) =>
      prev.map((c) =>
        c.id === contractId
          ? {
              ...c,
              bookingState: 'Closed',
              clientConfirmedAt: new Date().toISOString(),
            }
          : c
      )
    );

    setJobs((prev) =>
      prev.map((r) =>
        r.id === ctr.jobId ? { ...r, status: 'Closed' } : r
      )
    );

    addAuditLog(
      'Booking Completed & Closed',
      `Contract ${contractId}`,
      'Completed',
      'Closed'
    );

    addNotification(
      ctr.vendorId,
      'Booking Completed!',
      `${ctr.clientName} confirmed "${ctr.jobTitle}" is complete. Payment of ₹${ctr.amount.toLocaleString('en-IN')} is confirmed.`,
      'contract',
      `/contracts/${contractId}`
    );
  };

  // 6. Admin State Override
  const adminOverrideBookingState = (
    bookingId: string,
    targetState: BookingState,
    reason: string
  ) => {
    const req = jobs.find((r) => r.id === bookingId);
    const ctr = contracts.find((c) => c.jobId === bookingId || c.id === bookingId);

    const oldState = req?.status || ctr?.bookingState || 'Unknown';

    // Reviving a terminal state is explicitly forbidden per the admin panel's own rule.
    if (oldState === 'Closed' || oldState === 'Cancelled') return;

    if (req) {
      setJobs((prev) =>
        prev.map((r) => (r.id === bookingId ? { ...r, status: targetState } : r))
      );
    }

    if (ctr) {
      setContracts((prev) =>
        prev.map((c) => (c.id === ctr.id ? { ...c, bookingState: targetState } : c))
      );
    }

    addAuditLog(
      'ADMIN OVERRIDE APPLIED',
      `Booking ${bookingId}`,
      oldState,
      targetState,
      reason
    );
  };

  const markNotificationRead = (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
  };

  const markAllNotificationsRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const sendMessage = (contractId: string, text: string) => {
    const newMsg: ChatMessage = {
      id: generateId('msg'),
      contractId,
      senderId: currentUser.id,
      senderName: currentUser.name,
      text,
      timestamp: new Date().toISOString(),
      read: false,
    };
    setMessages((prev) => [...prev, newMsg]);
  };

  const markMessagesRead = (contractId: string) => {
    setMessages((prev) =>
      prev.map((m) =>
        m.contractId === contractId && m.senderId !== currentUser.id && !m.read
          ? { ...m, read: true }
          : m
      )
    );
  };

  const toggleFavoriteConversation = (contractId: string) => {
    setFavoriteConversationIds((prev) =>
      prev.includes(contractId) ? prev.filter((id) => id !== contractId) : [...prev, contractId]
    );
  };

  const togglePauseJob = (id: string) => {
    setJobs((prev) =>
      prev.map((r) => {
        if (r.id === id) {
          if (r.isDraftPost) return r;
          // Only an Open (or already-paused/Draft) job can be paused/resumed — once a job
          // has a contract (status flips to Confirmed/Completed/Closed), pausing it would
          // silently desync the job's own status from the contract that's actually running.
          if (r.status !== 'Open' && r.status !== 'Draft') return r;
          const isPaused = r.status === 'Draft' || r.isPaused;
          const newStatus = isPaused ? 'Open' : 'Draft';
          addAuditLog(
            'Job Status Changed',
            `Job ${id}`,
            r.status,
            newStatus,
            isPaused ? 'Resumed by Client' : 'Paused by Client'
          );
          return { ...r, status: newStatus, isPaused: !isPaused };
        }
        return r;
      })
    );
  };

  const deleteJob = (id: string) => {
    // A job with a contract is actively running (or finished) — deleting it would orphan
    // the contract's parent job while the contract keeps existing on its own.
    if (contracts.some((c) => c.jobId === id)) return;
    const job = jobs.find((r) => r.id === id);
    setJobs((prev) => prev.filter((r) => r.id !== id));
    addAuditLog('Job Deleted', `Job ${id}`, job?.status ?? 'Unknown', 'Deleted', 'Removed by Client');
  };

  const updateJob = (id: string, updates: Partial<EditableJobFields>) => {
    const job = jobs.find((r) => r.id === id);
    // Reuses the same normalizeJobBudget() the job-creation functions use, by normalizing
    // a full merged (job + updates) object and taking just the resulting budgetMax back —
    // updateJob's `updates` alone isn't a full Job (missing budgetMode), so it can't be
    // passed to normalizeJobBudget directly.
    const normalizedUpdates = job
      ? { ...updates, budgetMax: normalizeJobBudget({ ...job, ...updates }).budgetMax }
      : updates;
    setJobs((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...normalizedUpdates } : r))
    );
    addAuditLog(
      'Job Updated',
      `Job ${id}`,
      job?.status ?? 'Unknown',
      job?.status ?? 'Unknown',
      'Edited by Client'
    );
  };

  const getJobById = (id: string) => jobs.find((r) => r.id === id);
  const getProposalsForJob = (reqId: string) =>
    proposals.filter((p) => p.jobId === reqId);
  const getContractByJobId = (reqId: string) =>
    contracts.find((c) => c.jobId === reqId);
  const getContractById = (contractId: string) =>
    contracts.find((c) => c.id === contractId);

  return (
    <AppContext.Provider
      value={{
        currentUser,
        setCurrentUserRole,
        updateCurrentUser,
        route,
        navigate,
        goBack,
        jobs,
        proposals,
        contracts,
        auditLogs,
        notifications,
        messages,
        favoriteConversationIds,
        toggleFavoriteConversation,
        searchQuery,
        setSearchQuery,
        selectedCategoryFilter,
        setSelectedCategoryFilter,
        selectedLocationFilter,
        setSelectedLocationFilter,
        createJob,
        saveJobDraft,
        publishJobDraft,
        submitProposal,
        saveProposalDraft,
        hireVendor,
        vendorMarkCompleted,
        clientConfirmCompletion,
        adminOverrideBookingState,
        markNotificationRead,
        markAllNotificationsRead,
        sendMessage,
        markMessagesRead,
        togglePauseJob,
        deleteJob,
        updateJob,
        getJobById,
        getProposalsForJob,
        getContractByJobId,
        getContractById,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
