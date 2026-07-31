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
  ) => Promise<{ contract: Contract; success: boolean }>;

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
  updateJob: (id: string, updates: Partial<Job>) => void;
  
  // Helper helpers
  getJobById: (id: string) => Job | undefined;
  getProposalsForJob: (reqId: string) => Proposal[];
  getContractByJobId: (reqId: string) => Contract | undefined;
  getContractById: (contractId: string) => Contract | undefined;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const LOCAL_STORAGE_KEY = 'marche_app_state_v8';

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
      id: `log_${Date.now()}`,
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
      id: `notif_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
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

  // 1. Create Job
  const createJob = (data: JobDraftInput): Job => {
    const newReqId = `job_${Date.now()}`;
    const newReq: Job = {
      ...data,
      id: newReqId,
      clientId: currentUser.id,
      clientName: currentUser.name,
      clientAvatar: currentUser.avatar,
      clientCompany: currentUser.companyOrTitle,
      clientVerified: currentUser.verified,
      status: 'Open', // Active for proposals
      proposalsCount: 0,
      createdAt: new Date().toISOString(),
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
      const updated: Job = { ...existing, ...data, status: 'Draft', isDraftPost: true };
      setJobs((prev) => prev.map((r) => (r.id === draftId ? updated : r)));
      return updated;
    }

    const newReqId = `job_${Date.now()}`;
    const newReq: Job = {
      ...data,
      id: newReqId,
      clientId: currentUser.id,
      clientName: currentUser.name,
      clientAvatar: currentUser.avatar,
      clientCompany: currentUser.companyOrTitle,
      clientVerified: currentUser.verified,
      status: 'Draft',
      isDraftPost: true,
      proposalsCount: 0,
      createdAt: new Date().toISOString(),
    };

    setJobs((prev) => [newReq, ...prev]);
    addAuditLog('Job Draft Saved', `Job ${newReqId} ("${newReq.title || 'Untitled job'}")`, 'None', 'Draft');

    return newReq;
  };

  // 1c. Publish an existing Job Draft
  const publishJobDraft = (draftId: string, data: JobDraftInput): Job => {
    const existing = jobs.find((r) => r.id === draftId);
    if (!existing) throw new Error('Draft not found');

    const published: Job = { ...existing, ...data, status: 'Open', isDraftPost: false };
    setJobs((prev) => prev.map((r) => (r.id === draftId ? published : r)));

    addAuditLog('Job Published', `Job ${draftId} ("${published.title}")`, 'Draft', 'Open');

    notifyMatchingVendors(published);

    return published;
  };

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
        milestones: data.milestones.map((m, idx) => ({
          id: `ms_${existing.id}_${idx}`,
          title: m.title,
          amount: m.amount,
          description: m.description,
        })),
        status: 'submitted',
        submittedAt: new Date().toISOString(),
        portfolioLinks: data.portfolioLinks,
      };
      setProposals((prev) => prev.map((p) => (p.id === data.draftId ? newProposal : p)));
    } else {
      const newPropId = `prop_${Date.now()}`;
      newProposal = {
        id: newPropId,
        jobId: data.jobId,
        vendorId: currentUser.id,
        vendorName: currentUser.name,
        vendorAvatar: currentUser.avatar,
        vendorRating: currentUser.rating || 4.95,
        vendorReviewCount: currentUser.reviewCount || 12,
        vendorCategory: (targetReq?.category || 'Photography') as EventCategory,
        vendorLocation: currentUser.location || 'Mumbai, Maharashtra',
        bidAmount: data.bidAmount,
        coverLetter: data.coverLetter,
        estimatedDelivery: data.estimatedDelivery,
        proposedStartTime: data.proposedStartTime,
        proposedEndTime: data.proposedEndTime,
        milestones: data.milestones.map((m, idx) => ({
          id: `ms_${newPropId}_${idx}`,
          title: m.title,
          amount: m.amount,
          description: m.description,
        })),
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
        milestones: data.milestones.map((m, idx) => ({
          id: `ms_${existing.id}_${idx}`,
          title: m.title,
          amount: m.amount,
          description: m.description,
        })),
        status: 'draft',
        portfolioLinks: data.portfolioLinks,
      };
      setProposals((prev) => prev.map((p) => (p.id === draftId ? updated : p)));
      return updated;
    }

    const newPropId = `prop_${Date.now()}`;
    const targetReq = jobs.find((r) => r.id === data.jobId);
    const newProposal: Proposal = {
      id: newPropId,
      jobId: data.jobId,
      vendorId: currentUser.id,
      vendorName: currentUser.name,
      vendorAvatar: currentUser.avatar,
      vendorRating: currentUser.rating || 4.95,
      vendorReviewCount: currentUser.reviewCount || 12,
      vendorCategory: (targetReq?.category || 'Photography') as EventCategory,
      vendorLocation: currentUser.location || 'Mumbai, Maharashtra',
      bidAmount: data.bidAmount,
      coverLetter: data.coverLetter,
      estimatedDelivery: data.estimatedDelivery,
      proposedStartTime: data.proposedStartTime,
      proposedEndTime: data.proposedEndTime,
      milestones: data.milestones.map((m, idx) => ({
        id: `ms_${newPropId}_${idx}`,
        title: m.title,
        amount: m.amount,
        description: m.description,
      })),
      status: 'draft',
      submittedAt: new Date().toISOString(),
      portfolioLinks: data.portfolioLinks,
    };
    setProposals((prev) => [newProposal, ...prev]);
    return newProposal;
  };

  // 3. Hire Vendor & Confirm Booking
  const hireVendor = async (
    jobId: string,
    proposalId: string
  ): Promise<{ contract: Contract; success: boolean }> => {
    const req = jobs.find((r) => r.id === jobId);
    const prop = proposals.find((p) => p.id === proposalId);

    if (!req || !prop) {
      throw new Error('Job or proposal not found');
    }

    const slot = deriveSlotFromEvent(req.timingMode, req.eventStartTime);
    if (!isVendorSlotAvailable(prop.vendorId, req.eventDate, slot)) {
      throw new Error('This vendor is no longer available on the selected date.');
    }

    const contractId = `ctr_${Date.now()}`;
    const ackNumber = `MARCHE-ACK-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

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

    return { contract: newContract, success: true };
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
      id: `msg_${Date.now()}`,
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
    const job = jobs.find((r) => r.id === id);
    setJobs((prev) => prev.filter((r) => r.id !== id));
    addAuditLog('Job Deleted', `Job ${id}`, job?.status ?? 'Unknown', 'Deleted', 'Removed by Client');
  };

  const updateJob = (id: string, updates: Partial<Job>) => {
    const job = jobs.find((r) => r.id === id);
    setJobs((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...updates } : r))
    );
    addAuditLog(
      'Job Updated',
      `Job ${id}`,
      job?.status ?? 'Unknown',
      updates.status ?? job?.status ?? 'Unknown',
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
