import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  User,
  UserRole,
  Requirement,
  Proposal,
  Contract,
  AuditLogEntry,
  Notification,
  ChatMessage,
  BookingState,
  EscrowStatus,
  EventCategory,
} from '../types';
import {
  DEMO_USERS,
  INITIAL_REQUIREMENTS,
  INITIAL_PROPOSALS,
  INITIAL_CONTRACTS,
  INITIAL_AUDIT_LOGS,
  INITIAL_NOTIFICATIONS,
} from '../data/mockData';
import { deriveSlotFromEvent, markVendorSlotBooked } from '../lib/availability';

interface AppContextType {
  currentUser: User;
  setCurrentUserRole: (role: UserRole) => void;
  updateCurrentUser: (updates: Partial<User>) => void;
  route: string;
  navigate: (path: string) => void;
  goBack: () => void;
  requirements: Requirement[];
  proposals: Proposal[];
  contracts: Contract[];
  auditLogs: AuditLogEntry[];
  notifications: Notification[];
  messages: ChatMessage[];
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  selectedCategoryFilter: string;
  setSelectedCategoryFilter: (cat: string) => void;
  selectedLocationFilter: string;
  setSelectedLocationFilter: (loc: string) => void;
  
  // Actions
  createRequirement: (
    data: Omit<
      Requirement,
      | 'id'
      | 'clientId'
      | 'clientName'
      | 'clientAvatar'
      | 'clientCompany'
      | 'clientVerified'
      | 'proposalsCount'
      | 'createdAt'
      | 'status'
    >
  ) => Requirement;
  
  submitProposal: (
    data: {
      requirementId: string;
      bidAmount: number;
      coverLetter: string;
      estimatedDelivery: string;
      proposedStartTime?: string;
      proposedEndTime?: string;
      milestones: { title: string; amount: number; description: string }[];
    }
  ) => Proposal;
  
  hireVendorAndDepositEscrow: (
    requirementId: string,
    proposalId: string
  ) => Promise<{ contract: Contract; success: boolean }>;

  vendorMarkCompleted: (contractId: string) => void;
  clientConfirmCompletionAndReleaseEscrow: (contractId: string) => void;
  adminOverrideBookingState: (
    bookingId: string,
    targetState: BookingState,
    reason: string
  ) => void;
  
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  sendMessage: (contractId: string, text: string) => void;
  markMessagesRead: (contractId: string) => void;
  
  // Requirement quick actions
  togglePauseRequirement: (id: string) => void;
  deleteRequirement: (id: string) => void;
  updateRequirement: (id: string, updates: Partial<Requirement>) => void;
  
  // Helper helpers
  getRequirementById: (id: string) => Requirement | undefined;
  getProposalsForRequirement: (reqId: string) => Proposal[];
  getContractByRequirementId: (reqId: string) => Contract | undefined;
  getContractById: (contractId: string) => Contract | undefined;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const LOCAL_STORAGE_KEY = 'marche_app_state_v6';

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

  const [requirements, setRequirements] = useState<Requirement[]>(() => {
    const saved = localStorage.getItem(`${LOCAL_STORAGE_KEY}_requirements`);
    return saved ? JSON.parse(saved) : INITIAL_REQUIREMENTS;
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
    return saved ? JSON.parse(saved) : [];
  });

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('All');
  const [selectedLocationFilter, setSelectedLocationFilter] = useState<string>('All');

  // Sync state to local storage
  useEffect(() => {
    localStorage.setItem(`${LOCAL_STORAGE_KEY}_user_role`, currentUser.role);
    localStorage.setItem(`${LOCAL_STORAGE_KEY}_requirements`, JSON.stringify(requirements));
    localStorage.setItem(`${LOCAL_STORAGE_KEY}_proposals`, JSON.stringify(proposals));
    localStorage.setItem(`${LOCAL_STORAGE_KEY}_contracts`, JSON.stringify(contracts));
    localStorage.setItem(`${LOCAL_STORAGE_KEY}_audit`, JSON.stringify(auditLogs));
    localStorage.setItem(`${LOCAL_STORAGE_KEY}_notifications`, JSON.stringify(notifications));
    localStorage.setItem(`${LOCAL_STORAGE_KEY}_messages`, JSON.stringify(messages));
  }, [currentUser, requirements, proposals, contracts, auditLogs, notifications, messages]);

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
    type: 'proposal' | 'escrow' | 'contract' | 'system' | 'job_alert',
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

  // 1. Create Requirement
  const createRequirement = (
    data: Omit<
      Requirement,
      | 'id'
      | 'clientId'
      | 'clientName'
      | 'clientAvatar'
      | 'clientCompany'
      | 'clientVerified'
      | 'proposalsCount'
      | 'createdAt'
      | 'status'
    >
  ): Requirement => {
    const newReqId = `req_${Date.now()}`;
    const newReq: Requirement = {
      ...data,
      id: newReqId,
      clientId: currentUser.id,
      clientName: currentUser.name,
      clientAvatar: currentUser.avatar,
      clientCompany: currentUser.companyOrTitle,
      clientVerified: currentUser.verified,
      status: 'Escrow Held', // Active for proposals
      proposalsCount: 0,
      createdAt: new Date().toISOString(),
    };

    setRequirements((prev) => [newReq, ...prev]);

    addAuditLog(
      'Requirement Published',
      `Requirement ${newReq.id} ("${newReq.title}")`,
      'Draft',
      'Escrow Held (Open for Proposals)'
    );

    addNotification(
      'user_vendor_1',
      'New Matching Requirement',
      `New requirement posted in ${newReq.category}: "${newReq.title}"`,
      'job_alert',
      `/provider/requirements/${newReq.id}`
    );

    return newReq;
  };

  // 2. Submit Proposal
  const submitProposal = (data: {
    requirementId: string;
    bidAmount: number;
    coverLetter: string;
    estimatedDelivery: string;
    proposedStartTime?: string;
    proposedEndTime?: string;
    milestones: { title: string; amount: number; description: string }[];
  }): Proposal => {
    const newPropId = `prop_${Date.now()}`;
    const targetReq = requirements.find((r) => r.id === data.requirementId);

    const newProposal: Proposal = {
      id: newPropId,
      requirementId: data.requirementId,
      vendorId: currentUser.id,
      vendorName: currentUser.name,
      vendorAvatar: currentUser.avatar,
      vendorRating: currentUser.rating || 4.95,
      vendorReviewCount: currentUser.reviewCount || 12,
      vendorCategory: (targetReq?.category || 'Photography') as EventCategory,
      vendorLocation: currentUser.location || 'New York, NY',
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
    };

    setProposals((prev) => [newProposal, ...prev]);

    // Increment proposals count on requirement
    setRequirements((prev) =>
      prev.map((r) =>
        r.id === data.requirementId ? { ...r, proposalsCount: r.proposalsCount + 1 } : r
      )
    );

    addAuditLog(
      'Proposal Submitted',
      `Proposal ${newPropId} for Requirement ${data.requirementId}`,
      'None',
      `Submitted ($${data.bidAmount.toLocaleString()})`
    );

    if (targetReq) {
      addNotification(
        targetReq.clientId,
        'New Proposal Received',
        `${currentUser.name} submitted a proposal ($${data.bidAmount.toLocaleString()}) for "${targetReq.title}"`,
        'proposal',
        `/client/requirements/${targetReq.id}`
      );
    }

    return newProposal;
  };

  // 3. Hire & Deposit Escrow
  const hireVendorAndDepositEscrow = async (
    requirementId: string,
    proposalId: string
  ): Promise<{ contract: Contract; success: boolean }> => {
    const req = requirements.find((r) => r.id === requirementId);
    const prop = proposals.find((p) => p.id === proposalId);

    if (!req || !prop) {
      throw new Error('Requirement or proposal not found');
    }

    const contractId = `ctr_${Date.now()}`;
    const ackNumber = `MARCHE-ACK-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

    const newContract: Contract = {
      id: contractId,
      requirementId: req.id,
      requirementTitle: req.title,
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
      escrowStatus: 'HELD',
      createdAt: new Date().toISOString(),
      acknowledgementNumber: ackNumber,
    };

    // Update contract state
    setContracts((prev) => [newContract, ...prev]);

    // Auto-block the vendor's availability calendar for the confirmed event slot
    markVendorSlotBooked(
      prop.vendorId,
      req.eventDate,
      deriveSlotFromEvent(req.timingMode, req.eventStartTime),
    );

    // Update proposal state
    setProposals((prev) =>
      prev.map((p) => {
        if (p.id === proposalId) return { ...p, status: 'accepted' };
        if (p.requirementId === requirementId) return { ...p, status: 'declined' };
        return p;
      })
    );

    // Update requirement state
    setRequirements((prev) =>
      prev.map((r) =>
        r.id === requirementId ? { ...r, status: 'Confirmed' } : r
      )
    );

    // Write audit logs
    addAuditLog(
      'Simulated Escrow Deposit Success',
      `Booking ${req.id} / Contract ${contractId}`,
      'Pending Payment',
      `Escrow Held ($${prop.bidAmount.toLocaleString()})`
    );

    addAuditLog(
      'Vendor Hired & Contract Confirmed',
      `Contract ${contractId} with ${prop.vendorName}`,
      'Escrow Held',
      'Confirmed'
    );

    // Notifications
    addNotification(
      prop.vendorId,
      'You Have Been Hired!',
      `Congratulations! ${req.clientName} accepted your proposal ($${prop.bidAmount.toLocaleString()}) for "${req.title}". Funds held in escrow.`,
      'contract',
      `/contracts/${contractId}`
    );

    return { contract: newContract, success: true };
  };

  // 4. Vendor Marks Event Completed
  const vendorMarkCompleted = (contractId: string) => {
    const ctr = contracts.find((c) => c.id === contractId);
    if (!ctr) return;

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

    setRequirements((prev) =>
      prev.map((r) =>
        r.id === ctr.requirementId ? { ...r, status: 'Completed' } : r
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
      `${ctr.vendorName} marked the event "${ctr.requirementTitle}" as completed. Please confirm to release $${ctr.amount.toLocaleString()} escrow.`,
      'escrow',
      `/contracts/${contractId}`
    );
  };

  // 5. Client Confirms Completion & Releases Escrow
  const clientConfirmCompletionAndReleaseEscrow = (contractId: string) => {
    const ctr = contracts.find((c) => c.id === contractId);
    if (!ctr) return;

    setContracts((prev) =>
      prev.map((c) =>
        c.id === contractId
          ? {
              ...c,
              bookingState: 'Closed',
              escrowStatus: 'RELEASED',
              clientConfirmedAt: new Date().toISOString(),
              escrowReleasedAt: new Date().toISOString(),
            }
          : c
      )
    );

    setRequirements((prev) =>
      prev.map((r) =>
        r.id === ctr.requirementId ? { ...r, status: 'Closed' } : r
      )
    );

    addAuditLog(
      'Escrow Released & Booking Closed',
      `Contract ${contractId}`,
      'Escrow Held',
      'Escrow RELEASED ($' + ctr.amount.toLocaleString() + ')'
    );

    addNotification(
      ctr.vendorId,
      'Escrow Released!',
      `Payout of $${ctr.amount.toLocaleString()} for "${ctr.requirementTitle}" has been released from escrow to your payout account.`,
      'escrow',
      `/contracts/${contractId}`
    );
  };

  // 6. Admin State Override
  const adminOverrideBookingState = (
    bookingId: string,
    targetState: BookingState,
    reason: string
  ) => {
    const req = requirements.find((r) => r.id === bookingId);
    const ctr = contracts.find((c) => c.requirementId === bookingId || c.id === bookingId);

    const oldState = req?.status || ctr?.bookingState || 'Unknown';

    if (req) {
      setRequirements((prev) =>
        prev.map((r) => (r.id === bookingId ? { ...r, status: targetState } : r))
      );
    }

    if (ctr) {
      let newEscrow = ctr.escrowStatus;
      if (targetState === 'Escrow Released') newEscrow = 'RELEASED';
      if (targetState === 'Cancelled' || targetState === 'Expired') newEscrow = 'none';

      setContracts((prev) =>
        prev.map((c) =>
          c.id === ctr.id ? { ...c, bookingState: targetState, escrowStatus: newEscrow } : c
        )
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

  const togglePauseRequirement = (id: string) => {
    setRequirements((prev) =>
      prev.map((r) => {
        if (r.id === id) {
          const isPaused = r.status === 'Draft' || r.isPaused;
          const newStatus = isPaused ? 'Escrow Held' : 'Draft';
          addAuditLog(
            'Requirement Status Changed',
            `Requirement ${id}`,
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

  const deleteRequirement = (id: string) => {
    setRequirements((prev) => prev.filter((r) => r.id !== id));
    addAuditLog('Requirement Deleted', `Requirement ${id}`, 'Active', 'Deleted', 'Removed by Client');
  };

  const updateRequirement = (id: string, updates: Partial<Requirement>) => {
    setRequirements((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...updates } : r))
    );
    addAuditLog('Requirement Updated', `Requirement ${id}`, 'Before Update', 'Updated', 'Edited by Client');
  };

  const getRequirementById = (id: string) => requirements.find((r) => r.id === id);
  const getProposalsForRequirement = (reqId: string) =>
    proposals.filter((p) => p.requirementId === reqId);
  const getContractByRequirementId = (reqId: string) =>
    contracts.find((c) => c.requirementId === reqId);
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
        requirements,
        proposals,
        contracts,
        auditLogs,
        notifications,
        messages,
        searchQuery,
        setSearchQuery,
        selectedCategoryFilter,
        setSelectedCategoryFilter,
        selectedLocationFilter,
        setSelectedLocationFilter,
        createRequirement,
        submitProposal,
        hireVendorAndDepositEscrow,
        vendorMarkCompleted,
        clientConfirmCompletionAndReleaseEscrow,
        adminOverrideBookingState,
        markNotificationRead,
        markAllNotificationsRead,
        sendMessage,
        markMessagesRead,
        togglePauseRequirement,
        deleteRequirement,
        updateRequirement,
        getRequirementById,
        getProposalsForRequirement,
        getContractByRequirementId,
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
