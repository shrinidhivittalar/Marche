import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { useApiResource } from '../hooks/useApiResource';
import { usePolling } from '../hooks/usePolling';
import { notificationsApi, type ApiNotification } from '../lib/notifications-api';
import { messagesApi } from '../lib/messages-api';
import {
  User,
  UserRole,
  Job,
  Proposal,
  Contract,
  AuditLogEntry,
  Notification,
  BookingState,
  EventCategory,
  Review,
  ClientSettings,
  TalentProfile,
  Referral,
  IdentityVerification,
  Dispute,
  WorkDiaryEntry,
  LegalAcceptance,
  JobAlertSettings,
} from '../types';
import {
  DEMO_USERS,
  INITIAL_JOBS,
  INITIAL_PROPOSALS,
  INITIAL_CONTRACTS,
  INITIAL_AUDIT_LOGS,
  INITIAL_NOTIFICATIONS,
  INITIAL_TALENT,
} from '../data/mockData';
import { isBidWithinBudget } from '../lib/formatBudget';
import {
  BackendUser,
  forgotPasswordRequest,
  googleLoginRequest,
  loginRequest,
  logoutRequest,
  meRequest,
  refreshRequest,
  registerRequest,
  resetPasswordRequest,
  verifyEmailRequest,
} from '../lib/api';

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
  isAuthenticated: boolean;
  // Exposed so the Profiles and Marketplace clients can authorise their
  // requests. In memory only — never persisted; the httpOnly refresh cookie
  // is what survives a reload.
  accessToken: string | null;
  authLoading: boolean;
  registerAccount: (data: {
    email: string;
    password: string;
    name: string;
    role: 'client' | 'vendor';
  }) => Promise<void>;
  loginWithCredentials: (email: string, password: string) => Promise<void>;
  // Resolves with verificationEmailSent:true on the (rare) path where
  // Google's token didn't confirm the email and the backend fell back to
  // the same email-verification flow register() uses — no session is
  // created in that case, same as registerAccount. Otherwise resolves
  // false once the session is live, same contract as loginWithCredentials.
  loginWithGoogle: (idToken: string) => Promise<{ verificationEmailSent: boolean }>;
  logoutAccount: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  submitPasswordReset: (token: string, newPassword: string) => Promise<void>;
  verifyEmailToken: (token: string) => Promise<void>;
  submitIdentityVerification: (data: Omit<IdentityVerification, 'status' | 'submittedAt'>) => void;
  acceptLegalTerms: (data: {
    role?: UserRole;
    context: LegalAcceptance['context'];
    name?: string;
    email?: string;
    companyOrTitle?: string;
  }) => LegalAcceptance;
  route: string;
  navigate: (path: string) => void;
  goBack: () => void;
  jobs: Job[];
  proposals: Proposal[];
  contracts: Contract[];
  auditLogs: AuditLogEntry[];
  notifications: Notification[];
  // Module 6's real notifications — separate from the mock `notifications`
  // above, which still serves job alerts, contracts, disputes and reviews:
  // modules with no backend yet. See the comment above apiNotificationsList.
  apiNotifications: ApiNotification[];
  apiNotificationsLoading: boolean;
  apiNotificationsError: string | null;
  apiNotificationsHasMore: boolean;
  loadMoreNotifications: () => void;
  apiUnreadCount: number;
  markApiNotificationRead: (id: string) => Promise<void>;
  markAllApiNotificationsRead: () => Promise<void>;
  apiMessagesUnreadCount: number;
  reviews: Review[];
  talentProfiles: TalentProfile[];
  referrals: Referral[];
  disputes: Dispute[];
  workDiaryEntries: WorkDiaryEntry[];
  favoriteConversationIds: string[];
  toggleFavoriteConversation: (contractId: string) => void;
  savedTalentIds: string[];
  toggleSavedTalent: (vendorId: string) => void;
  createReferral: (data: {
    name: string;
    email: string;
    specialty: string;
    note?: string;
  }) => Referral;
  clientSettings: ClientSettings;
  updateClientSettings: (updates: Partial<ClientSettings>) => void;
  jobAlertSettings: JobAlertSettings;
  updateJobAlertSettings: (updates: Partial<JobAlertSettings>) => void;
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

  submitProposal: (data: {
    jobId: string;
    bidAmount: number;
    coverLetter: string;
    estimatedDelivery: string;
    proposedStartTime?: string;
    proposedEndTime?: string;
    milestones: { title: string; amount: number; description: string }[];
    portfolioLinks?: string[];
    draftId?: string;
  }) => Proposal;

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
    },
  ) => Proposal;

  vendorMarkCompleted: (contractId: string) => void;
  clientConfirmCompletion: (contractId: string) => void;
  submitReview: (data: { contractId: string; rating: number; comment: string }) => Review;
  raiseDispute: (data: { contractId: string; reason: string; evidence: string }) => Dispute;
  addWorkDiaryEntry: (data: {
    contractId: string;
    workDate: string;
    hours: number;
    summary: string;
    proofUrl?: string;
  }) => WorkDiaryEntry;
  adminOverrideBookingState: (bookingId: string, targetState: BookingState, reason: string) => void;

  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;

  // Job quick actions
  togglePauseJob: (id: string) => void;
  deleteJob: (id: string) => void;
  updateJob: (id: string, updates: Partial<EditableJobFields>) => void;

  // Helper helpers
  getJobById: (id: string) => Job | undefined;
  getProposalsForJob: (reqId: string) => Proposal[];
  getContractByJobId: (reqId: string) => Contract | undefined;
  getContractById: (contractId: string) => Contract | undefined;
  getReviewForContract: (contractId: string) => Review | undefined;
  getReviewsForVendor: (vendorId: string) => Review[];
  getDisputeForContract: (contractId: string) => Dispute | undefined;
  getWorkDiaryForContract: (contractId: string) => WorkDiaryEntry[];
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const LOCAL_STORAGE_KEY = 'marche_app_state_v8';
const TERMS_VERSION = 'marche-terms-v1';
// Mirrors the access-token TTL in apps/api/src/identity/services/auth.service.ts.
// Renewed a minute early so a request in flight when the timer fires is still
// carrying a token the API accepts.
const ACCESS_TOKEN_TTL_MS = 15 * 60 * 1000;
const ACCESS_TOKEN_RENEW_MARGIN_MS = 60 * 1000;
const PRIVACY_VERSION = 'marche-privacy-v1';

const DEFAULT_CLIENT_SETTINGS: ClientSettings = {
  instantProposalAlerts: true,
  milestoneReminders: true,
};

const getDefaultJobAlertSettings = (vendorId: string): JobAlertSettings => {
  const talent = INITIAL_TALENT.find((item) => item.id === vendorId);
  return {
    enabled: true,
    categories: talent ? [talent.category] : [],
    locationMode: 'anywhere',
  };
};

// Timestamp alone can collide if two records are created in the same millisecond;
// the random suffix (matching the pattern already used for notifications) avoids that.
function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`;
}

// Fixed-budget jobs must keep max mirrored to min so provider bid validation stays
// consistent — enforced once here instead of separately in every place a job is
// created or edited.
function normalizeJobBudget<
  T extends { budgetMode: 'fixed' | 'range'; budgetMin: number; budgetMax: number },
>(data: T): T {
  return data.budgetMode === 'fixed' ? { ...data, budgetMax: data.budgetMin } : data;
}

// The backend (Identity module) only knows CLIENT/PROVIDER/ADMIN — the
// frontend's role vocabulary predates it and uses 'vendor' instead of
// 'provider'. Translate at this one boundary rather than renaming it
// throughout the app.
function backendRoleToUserRole(role: BackendUser['role']): UserRole {
  if (role === 'PROVIDER') return 'vendor';
  if (role === 'ADMIN') return 'admin';
  return 'client';
}

function userRoleToBackendRole(role: 'client' | 'vendor'): 'CLIENT' | 'PROVIDER' {
  return role === 'vendor' ? 'PROVIDER' : 'CLIENT';
}

// The Profile module doesn't exist yet, so a real backend account has no
// avatar/bio/rating/etc. — fill those with sensible new-account defaults,
// the same way a freshly onboarded demo user would look.
function buildUserFromBackend(backendUser: BackendUser): User {
  return {
    id: backendUser.id,
    name: backendUser.name,
    email: backendUser.email,
    avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(backendUser.name)}&background=random`,
    role: backendRoleToUserRole(backendUser.role),
    // Carried straight through from the API. `role` above still drives
    // every routing/mode decision in this app — that migration is separate
    // and deliberately not part of this change; this only makes the real
    // capability set available to build on.
    capabilities: backendUser.capabilities,
    verified: backendUser.emailVerified,
    memberSince: new Date().toISOString(),
  };
}

function loadUserWithOverrides(role: UserRole): User {
  const base = DEMO_USERS[role];
  const saved = localStorage.getItem(`${LOCAL_STORAGE_KEY}_profile_${role}`);
  return saved ? { ...base, ...JSON.parse(saved) } : base;
}
function applyUserToTalentProfile(talent: TalentProfile, user: User): TalentProfile {
  if (talent.id !== user.id) return talent;

  return {
    ...talent,
    name: user.name,
    avatar: user.avatar,
    headline: user.companyOrTitle || talent.headline,
    bio: user.bio || talent.bio,
    location: user.location || talent.location,
    hourlyRate: user.hourlyRate ?? talent.hourlyRate,
    verified: user.verified,
    skills: user.skills?.length ? user.skills : talent.skills,
    education: user.education?.length ? user.education : talent.education,
  };
}

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User>(() => {
    const saved = localStorage.getItem(`${LOCAL_STORAGE_KEY}_user_role`);
    const isUserRole = (value: string | null): value is UserRole =>
      value === 'client' || value === 'vendor' || value === 'admin';
    return loadUserWithOverrides(isUserRole(saved) ? saved : 'client');
  });

  // In-memory only — never persisted. The httpOnly refresh-token cookie is
  // what survives a reload; this is restored via silent refresh on mount.
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { accessToken: token } = await refreshRequest();
        const backendUser = await meRequest(token);
        if (cancelled) return;
        setAccessToken(token);
        setCurrentUser(buildUserFromBackend(backendUser));
      } catch {
        // No valid session cookie — stay in demo mode, exactly as before.
      } finally {
        if (!cancelled) setAuthLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Module 6's real notifications — a single shared fetch here rather than
  // one per consumer (Sidebar's bell, NotificationsPage), so marking one
  // read updates every badge at once. This app has no query client (see
  // useApiResource.ts), so "shared" means "lives in the one context both
  // already read", not a cache.
  //
  // "Load more" grows this limit and refetches page 1 again, rather than
  // fetching page 2 and appending — a second, disjoint list would need its
  // own read-state bookkeeping after every mark-as-read. Wasteful past a
  // few thousand notifications, which is not this app's scale yet.
  const [notificationsLimit, setNotificationsLimit] = useState(50);
  const apiNotificationsList = useApiResource(
    () => notificationsApi.list(accessToken as string, 1, notificationsLimit),
    [accessToken, notificationsLimit],
    { enabled: Boolean(accessToken) },
  );
  const loadMoreNotifications = () => setNotificationsLimit((prev) => prev + 50);
  const apiNotificationsUnread = useApiResource(
    () => notificationsApi.unreadCount(accessToken as string),
    [accessToken],
    { enabled: Boolean(accessToken) },
  );
  const apiMessagesUnread = useApiResource(
    () => messagesApi.unreadCount(accessToken as string),
    [accessToken],
    { enabled: Boolean(accessToken) },
  );

  // Same interval MessagesPage polls an open thread at. These three are the
  // one layer mounted on every screen (the bell, its badge, the sidebar's
  // message count) — everything else in the app only refetches on its own
  // page load or after an action taken on that page, which is a deliberate
  // scope call (see usePolling's own comment) rather than an oversight.
  usePolling(apiNotificationsList.refetch, Boolean(accessToken));
  usePolling(apiNotificationsUnread.refetch, Boolean(accessToken));
  usePolling(apiMessagesUnread.refetch, Boolean(accessToken));

  // Both of these mark read locally before the request goes out. Clicking a
  // notification navigates away in the same tick, so waiting for the round
  // trip left the badge showing its old count on the destination screen for
  // as long as the hosted database took to answer — the one number the user
  // is watching, wrong, on the screen they just asked for.
  //
  // The optimistic state is never the last word: the refetch runs either way
  // in the finally, so a rejected request corrects the display rather than
  // leaving it lying. Failure is still surfaced by rethrowing — callers show
  // their own message (see NotificationsPage's actionError).
  const reconcileNotifications = () =>
    Promise.all([apiNotificationsList.refetch(), apiNotificationsUnread.refetch()]);

  const markApiNotificationRead = async (id: string) => {
    if (!accessToken) return;

    // Only an unread one changes the count, and marking read is idempotent
    // on the API — clicking an already-read notification must not decrement.
    const wasUnread = apiNotificationsList.data?.items.some(
      (item) => item.id === id && item.readAt === null,
    );

    const readAt = new Date().toISOString();
    apiNotificationsList.mutate((current) => ({
      ...current,
      items: current.items.map((item) => (item.id === id ? { ...item, readAt } : item)),
    }));
    if (wasUnread) {
      apiNotificationsUnread.mutate((current) => ({ count: Math.max(0, current.count - 1) }));
    }

    try {
      await notificationsApi.markAsRead(accessToken, id);
    } finally {
      await reconcileNotifications();
    }
  };

  const markAllApiNotificationsRead = async () => {
    if (!accessToken) return;

    const readAt = new Date().toISOString();
    apiNotificationsList.mutate((current) => ({
      ...current,
      items: current.items.map((item) => (item.readAt === null ? { ...item, readAt } : item)),
    }));
    // Zero, not a subtraction: read-all covers notifications past the page
    // this client is holding, so the local list is not a count of what
    // changed.
    apiNotificationsUnread.mutate(() => ({ count: 0 }));

    try {
      await notificationsApi.markAllRead(accessToken);
    } finally {
      await reconcileNotifications();
    }
  };

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

  const [reviews, setReviews] = useState<Review[]>(() => {
    const saved = localStorage.getItem(`${LOCAL_STORAGE_KEY}_reviews`);
    return saved ? JSON.parse(saved) : [];
  });

  const [favoriteConversationIds, setFavoriteConversationIds] = useState<string[]>(() => {
    const saved = localStorage.getItem(`${LOCAL_STORAGE_KEY}_favorite_conversations`);
    return saved ? JSON.parse(saved) : [];
  });

  const [savedTalentIds, setSavedTalentIds] = useState<string[]>(() => {
    const saved = localStorage.getItem(`${LOCAL_STORAGE_KEY}_saved_talent`);
    return saved ? JSON.parse(saved) : [];
  });
  const [referrals, setReferrals] = useState<Referral[]>(() => {
    const saved = localStorage.getItem(`${LOCAL_STORAGE_KEY}_referrals`);
    return saved ? JSON.parse(saved) : [];
  });
  const [disputes, setDisputes] = useState<Dispute[]>(() => {
    const saved = localStorage.getItem(`${LOCAL_STORAGE_KEY}_disputes`);
    return saved ? JSON.parse(saved) : [];
  });
  const [workDiaryEntries, setWorkDiaryEntries] = useState<WorkDiaryEntry[]>(() => {
    const saved = localStorage.getItem(`${LOCAL_STORAGE_KEY}_work_diary`);
    return saved ? JSON.parse(saved) : [];
  });

  const [clientSettings, setClientSettings] = useState<ClientSettings>(() => {
    const saved = localStorage.getItem(`${LOCAL_STORAGE_KEY}_client_settings`);
    return saved ? { ...DEFAULT_CLIENT_SETTINGS, ...JSON.parse(saved) } : DEFAULT_CLIENT_SETTINGS;
  });
  const [jobAlertSettingsByVendor, setJobAlertSettingsByVendor] = useState<
    Record<string, JobAlertSettings>
  >(() => {
    const saved = localStorage.getItem(`${LOCAL_STORAGE_KEY}_job_alert_settings`);
    return saved ? JSON.parse(saved) : {};
  });
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('All');
  const [selectedLocationFilter, setSelectedLocationFilter] = useState<string>('All');
  const publicVendorUser = useMemo(
    () => (currentUser.role === 'vendor' ? currentUser : loadUserWithOverrides('vendor')),
    [currentUser],
  );
  const talentProfiles = useMemo(
    () => INITIAL_TALENT.map((talent) => applyUserToTalentProfile(talent, publicVendorUser)),
    [publicVendorUser],
  );
  const jobAlertSettings = {
    ...getDefaultJobAlertSettings(currentUser.id),
    ...jobAlertSettingsByVendor[currentUser.id],
  };

  // Sync state to local storage
  useEffect(() => {
    localStorage.setItem(`${LOCAL_STORAGE_KEY}_user_role`, currentUser.role);
    localStorage.setItem(`${LOCAL_STORAGE_KEY}_jobs`, JSON.stringify(jobs));
    localStorage.setItem(`${LOCAL_STORAGE_KEY}_proposals`, JSON.stringify(proposals));
    localStorage.setItem(`${LOCAL_STORAGE_KEY}_contracts`, JSON.stringify(contracts));
    localStorage.setItem(`${LOCAL_STORAGE_KEY}_audit`, JSON.stringify(auditLogs));
    localStorage.setItem(`${LOCAL_STORAGE_KEY}_notifications`, JSON.stringify(notifications));
    localStorage.setItem(`${LOCAL_STORAGE_KEY}_reviews`, JSON.stringify(reviews));
    localStorage.setItem(
      `${LOCAL_STORAGE_KEY}_favorite_conversations`,
      JSON.stringify(favoriteConversationIds),
    );
    localStorage.setItem(`${LOCAL_STORAGE_KEY}_saved_talent`, JSON.stringify(savedTalentIds));
    localStorage.setItem(`${LOCAL_STORAGE_KEY}_referrals`, JSON.stringify(referrals));
    localStorage.setItem(`${LOCAL_STORAGE_KEY}_disputes`, JSON.stringify(disputes));
    localStorage.setItem(`${LOCAL_STORAGE_KEY}_work_diary`, JSON.stringify(workDiaryEntries));
    localStorage.setItem(`${LOCAL_STORAGE_KEY}_client_settings`, JSON.stringify(clientSettings));
  }, [
    currentUser,
    jobs,
    proposals,
    contracts,
    auditLogs,
    notifications,
    reviews,
    favoriteConversationIds,
    savedTalentIds,
    referrals,
    disputes,
    workDiaryEntries,
    clientSettings,
    jobAlertSettingsByVendor,
  ]);

  // Handle popstate for back/forward navigation
  useEffect(() => {
    const handlePopState = () => {
      setRoute(window.location.pathname || '/');
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // The browser's back-forward cache can restore this whole page — DOM and JS
  // state included — from before a logout, without re-running any of our
  // code. That leaves a frozen, visually "signed in" page on screen even
  // though the refresh cookie behind it was already revoked. Reloading on
  // restore forces the mount effect above to re-run its silent refresh
  // against the real session instead of trusting the stale snapshot.
  useEffect(() => {
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) window.location.reload();
    };
    window.addEventListener('pageshow', handlePageShow);
    return () => window.removeEventListener('pageshow', handlePageShow);
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

  const registerAccount = async (data: {
    email: string;
    password: string;
    name: string;
    role: 'client' | 'vendor';
  }) => {
    await registerRequest({
      email: data.email,
      password: data.password,
      name: data.name,
      role: userRoleToBackendRole(data.role),
    });
    // Registration does not log the account in — it still needs email
    // verification (docs/domain_rules.md), so no session is created here.
  };

  const loginWithCredentials = async (email: string, password: string) => {
    const { accessToken: token, user } = await loginRequest({ email, password });
    setAccessToken(token);
    const mappedUser = buildUserFromBackend(user);
    setCurrentUser(mappedUser);
    navigate(mappedUser.role === 'vendor' ? '/provider/dashboard' : '/client/dashboard');
  };

  const loginWithGoogle = async (idToken: string) => {
    const result = await googleLoginRequest(idToken);
    if (!('accessToken' in result)) {
      // Google didn't confirm the email — same non-session outcome as
      // registerAccount; the caller shows the same "check your email"
      // messaging that path already has.
      return { verificationEmailSent: true };
    }
    setAccessToken(result.accessToken);
    const mappedUser = buildUserFromBackend(result.user);
    setCurrentUser(mappedUser);
    navigate(mappedUser.role === 'vendor' ? '/provider/dashboard' : '/client/dashboard');
    return { verificationEmailSent: false };
  };

  const logoutAccount = async () => {
    if (accessToken) {
      await logoutRequest().catch(() => {
        // Best-effort: clear local session state even if the network call fails.
      });
    }
    setAccessToken(null);
    setCurrentUser(loadUserWithOverrides('client'));
    navigate('/auth/signin');
  };

  // The access token expires after 15 minutes and nothing renewed it, so a tab
  // left open came back to every useApiResource screen failing until a reload.
  // Renewing on a timer — rather than reacting to a 401 — is what this app's
  // shape supports: the token is an argument to every API function and a
  // dependency of every useApiResource call, so publishing a new one here
  // refetches the screens by itself. A 401 interceptor would instead have to
  // reach back into each call site to hand it the replacement token.
  //
  // Concurrent refreshes collapse inside refreshRequest(), which shares one
  // in-flight promise — the refresh cookie is single-use and rotating, so a
  // second call would arrive with a revoked token.
  useEffect(() => {
    if (!accessToken) return;
    const timer = setTimeout(async () => {
      try {
        const { accessToken: token } = await refreshRequest();
        setAccessToken(token);
      } catch {
        // The refresh cookie is expired or already rotated away. Nothing but
        // fresh credentials can recover from that, so end the session cleanly
        // instead of retrying against a token that will never work again.
        setAccessToken(null);
        setCurrentUser(loadUserWithOverrides('client'));
        navigate('/auth/signin');
      }
    }, ACCESS_TOKEN_TTL_MS - ACCESS_TOKEN_RENEW_MARGIN_MS);
    return () => clearTimeout(timer);
    // Only the token may restart the timer — `navigate` is redefined every
    // render, so depending on it would reset the timeout before it ever fired.
  }, [accessToken]);

  const requestPasswordReset = async (email: string) => {
    await forgotPasswordRequest(email);
  };

  const submitPasswordReset = async (token: string, newPassword: string) => {
    await resetPasswordRequest(token, newPassword);
  };

  const verifyEmailToken = async (token: string) => {
    await verifyEmailRequest(token);
  };

  const updateCurrentUser = (updates: Partial<User>) => {
    // Persisted here rather than inside the updater: React double-invokes
    // updaters under StrictMode, so the write ran twice per call. Same shape
    // acceptLegalTerms already uses — merge onto the stored overrides, then
    // update state.
    const storageKey = `${LOCAL_STORAGE_KEY}_profile_${currentUser.role}`;
    const savedRaw = localStorage.getItem(storageKey);
    const savedOverrides = savedRaw ? JSON.parse(savedRaw) : {};
    localStorage.setItem(storageKey, JSON.stringify({ ...savedOverrides, ...updates }));
    setCurrentUser((prev) => ({ ...prev, ...updates }));
  };

  const acceptLegalTerms = (data: {
    role?: UserRole;
    context: LegalAcceptance['context'];
    name?: string;
    email?: string;
    companyOrTitle?: string;
  }): LegalAcceptance => {
    const role = data.role || currentUser.role;
    const baseUser = role === currentUser.role ? currentUser : loadUserWithOverrides(role);
    const acceptedByName = data.name?.trim() || baseUser.name;
    const acceptedById = baseUser.id;
    const acceptance: LegalAcceptance = {
      termsVersion: TERMS_VERSION,
      privacyVersion: PRIVACY_VERSION,
      acceptedAt: new Date().toISOString(),
      acceptedById,
      acceptedByName,
      acceptedByRole: role,
      context: data.context,
    };

    const updates: Partial<User> = {
      legalAcceptance: acceptance,
      ...(data.name?.trim() ? { name: data.name.trim() } : {}),
      ...(data.email?.trim() ? { email: data.email.trim() } : {}),
      ...(data.companyOrTitle?.trim() ? { companyOrTitle: data.companyOrTitle.trim() } : {}),
    };

    const savedRaw = localStorage.getItem(`${LOCAL_STORAGE_KEY}_profile_${role}`);
    const savedOverrides = savedRaw ? JSON.parse(savedRaw) : {};
    localStorage.setItem(
      `${LOCAL_STORAGE_KEY}_profile_${role}`,
      JSON.stringify({ ...savedOverrides, ...updates }),
    );

    if (role === currentUser.role) {
      setCurrentUser((prev) => ({ ...prev, ...updates }));
    }

    addAuditLog(
      'Legal Terms Accepted',
      `User ${acceptedById}`,
      'Not accepted',
      `${TERMS_VERSION} / ${PRIVACY_VERSION}`,
      data.context,
    );
    return acceptance;
  };
  const submitIdentityVerification = (
    data: Omit<IdentityVerification, 'status' | 'submittedAt'>,
  ) => {
    updateCurrentUser({
      identityVerification: {
        ...data,
        legalName: data.legalName.trim(),
        documentLast4: data.documentLast4.trim(),
        address: data.address.trim(),
        status: 'pending',
        submittedAt: new Date().toISOString(),
      },
    });

    addAuditLog(
      'Identity Verification Submitted',
      'User ' + currentUser.id,
      'Not submitted',
      'Pending review',
    );
    addNotification(
      currentUser.id,
      'Identity Verification Submitted',
      'Your verification details were saved for review in this frontend preview.',
      'system',
      currentUser.role === 'vendor' ? '/provider/profile' : '/client/profile',
    );
  };

  const addAuditLog = (
    action: string,
    targetEntity: string,
    beforeState?: string,
    afterState?: string,
    reason?: string,
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
    linkRoute?: string,
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

  // Notifies vendors whose saved alert preferences match the new job.
  const notifyMatchingVendors = (job: Job) => {
    INITIAL_TALENT.forEach((vendor) => {
      const settings = {
        ...getDefaultJobAlertSettings(vendor.id),
        ...jobAlertSettingsByVendor[vendor.id],
      };
      const matchesCategory =
        settings.categories.length === 0 || settings.categories.includes(job.category);
      const vendorProfile = vendor.id === currentUser.id ? currentUser : vendor;
      const profileLocation = vendorProfile.location?.toLowerCase().trim();
      const matchesLocation =
        settings.locationMode === 'anywhere' ||
        !profileLocation ||
        job.location.toLowerCase().includes(profileLocation) ||
        profileLocation.includes(job.location.toLowerCase());

      if (!settings.enabled || !matchesCategory || !matchesLocation) return;

      addNotification(
        vendor.id,
        'New Matching Job',
        `New job posted in ${job.category}: "${job.title}"`,
        'job_alert',
        `/provider/jobs/${job.id}`,
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

    addAuditLog('Job Published', `Job ${newReq.id} ("${newReq.title}")`, 'Draft', 'Open');

    notifyMatchingVendors(newReq);

    return newReq;
  };

  // 1b. Save Job Draft (create a new draft, or update an existing one in place)
  const saveJobDraft = (draftId: string | null, data: JobDraftInput): Job => {
    if (draftId) {
      const existing = jobs.find((r) => r.id === draftId);
      if (!existing) throw new Error('Draft not found');
      const updated: Job = {
        ...existing,
        ...normalizeJobBudget(data),
        status: 'Draft',
        isDraftPost: true,
      };
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
    addAuditLog(
      'Job Draft Saved',
      `Job ${newReqId} ("${newReq.title || 'Untitled job'}")`,
      'None',
      'Draft',
    );

    return newReq;
  };

  // 1c. Publish an existing Job Draft
  const publishJobDraft = (draftId: string, data: JobDraftInput): Job => {
    const existing = jobs.find((r) => r.id === draftId);
    if (!existing) throw new Error('Draft not found');

    const published: Job = {
      ...existing,
      ...normalizeJobBudget(data),
      status: 'Open',
      isDraftPost: false,
    };
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
    milestones: { title: string; amount: number; description: string }[],
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
      prev.map((r) => (r.id === data.jobId ? { ...r, proposalsCount: r.proposalsCount + 1 } : r)),
    );

    addAuditLog(
      'Proposal Submitted',
      `Proposal ${newProposal.id} for Job ${data.jobId}`,
      'None',
      `Submitted (₹${data.bidAmount.toLocaleString('en-IN')})`,
    );

    if (targetReq) {
      addNotification(
        targetReq.clientId,
        'New Proposal Received',
        `${currentUser.name} submitted a proposal (₹${data.bidAmount.toLocaleString('en-IN')}) for "${targetReq.title}"`,
        'proposal',
        `/client/jobs/${targetReq.id}`,
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
    },
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
          : c,
      ),
    );

    setJobs((prev) => prev.map((r) => (r.id === ctr.jobId ? { ...r, status: 'Completed' } : r)));

    addAuditLog(
      'Vendor Marked Event Completed',
      `Contract ${contractId}`,
      'Confirmed',
      'Completed',
    );

    addNotification(
      ctr.clientId,
      'Event Marked Delivered',
      `${ctr.vendorName} marked the event "${ctr.jobTitle}" as completed. Please confirm to close out the booking.`,
      'contract',
      `/contracts/${contractId}`,
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
          : c,
      ),
    );

    setJobs((prev) => prev.map((r) => (r.id === ctr.jobId ? { ...r, status: 'Closed' } : r)));

    addAuditLog('Booking Completed & Closed', `Contract ${contractId}`, 'Completed', 'Closed');

    addNotification(
      ctr.vendorId,
      'Booking Completed!',
      `${ctr.clientName} confirmed "${ctr.jobTitle}" is complete. Payment of ₹${ctr.amount.toLocaleString('en-IN')} is confirmed.`,
      'contract',
      `/contracts/${contractId}`,
    );
  };

  const submitReview = (data: { contractId: string; rating: number; comment: string }): Review => {
    const ctr = contracts.find((c) => c.id === data.contractId);
    if (!ctr) throw new Error('Contract not found');
    if (ctr.bookingState !== 'Closed')
      throw new Error('Reviews can only be left after a contract is closed.');
    if (ctr.clientId !== currentUser.id)
      throw new Error('Only the client can review this contract.');
    if (reviews.some((review) => review.contractId === data.contractId)) {
      throw new Error('This contract already has a review.');
    }

    const review: Review = {
      id: generateId('rev'),
      contractId: ctr.id,
      jobId: ctr.jobId,
      jobTitle: ctr.jobTitle,
      vendorId: ctr.vendorId,
      vendorName: ctr.vendorName,
      clientId: ctr.clientId,
      clientName: ctr.clientName,
      rating: Math.min(5, Math.max(1, data.rating)),
      comment: data.comment.trim(),
      createdAt: new Date().toISOString(),
    };

    setReviews((prev) => [review, ...prev]);
    addAuditLog(
      'Review Submitted',
      'Review ' + review.id + ' for Contract ' + ctr.id,
      'None',
      review.rating + ' stars',
    );
    addNotification(
      ctr.vendorId,
      'New Client Review',
      ctr.clientName + ' left a ' + review.rating + '-star review for "' + ctr.jobTitle + '".',
      'contract',
      '/contracts/' + ctr.id,
    );

    return review;
  };
  const raiseDispute = (data: {
    contractId: string;
    reason: string;
    evidence: string;
  }): Dispute => {
    const ctr = contracts.find((c) => c.id === data.contractId);
    if (!ctr) throw new Error('Contract not found');
    if (ctr.bookingState === 'Closed' || ctr.bookingState === 'Cancelled') {
      throw new Error('Disputes can only be raised before a contract reaches a terminal state.');
    }
    if (
      disputes.some(
        (dispute) => dispute.contractId === data.contractId && dispute.status !== 'resolved',
      )
    ) {
      throw new Error('This contract already has an active dispute.');
    }

    const raisedAgainstId = currentUser.id === ctr.clientId ? ctr.vendorId : ctr.clientId;
    const raisedAgainstName = currentUser.id === ctr.clientId ? ctr.vendorName : ctr.clientName;
    const dispute: Dispute = {
      id: generateId('dsp'),
      contractId: ctr.id,
      jobTitle: ctr.jobTitle,
      raisedById: currentUser.id,
      raisedByName: currentUser.name,
      raisedAgainstId,
      raisedAgainstName,
      reason: data.reason.trim(),
      evidence: data.evidence.trim(),
      status: 'open',
      createdAt: new Date().toISOString(),
    };

    setDisputes((prev) => [dispute, ...prev]);
    addAuditLog(
      'Dispute Raised',
      'Dispute ' + dispute.id + ' for Contract ' + ctr.id,
      'None',
      'Open',
    );
    addNotification(
      raisedAgainstId,
      'Dispute Raised',
      currentUser.name + ' raised a dispute on "' + ctr.jobTitle + '".',
      'contract',
      '/contracts/' + ctr.id,
    );
    addNotification(
      DEMO_USERS.admin.id,
      'Dispute Needs Review',
      'A dispute was raised on "' + ctr.jobTitle + '".',
      'system',
      '/admin/audit',
    );

    return dispute;
  };
  const addWorkDiaryEntry = (data: {
    contractId: string;
    workDate: string;
    hours: number;
    summary: string;
    proofUrl?: string;
  }): WorkDiaryEntry => {
    const ctr = contracts.find((c) => c.id === data.contractId);
    if (!ctr) throw new Error('Contract not found');
    if (ctr.vendorId !== currentUser.id)
      throw new Error('Only the hired provider can add work diary entries.');
    if (ctr.bookingState !== 'Confirmed' && ctr.bookingState !== 'Completed') {
      throw new Error(
        'Work diary entries can only be added while a contract is active or awaiting completion review.',
      );
    }
    if (data.hours <= 0 || data.hours > 24) {
      throw new Error('Hours must be between 0 and 24.');
    }

    const entry: WorkDiaryEntry = {
      id: generateId('wde'),
      contractId: ctr.id,
      vendorId: ctr.vendorId,
      vendorName: ctr.vendorName,
      workDate: data.workDate,
      hours: data.hours,
      summary: data.summary.trim(),
      proofUrl: data.proofUrl?.trim() || undefined,
      createdAt: new Date().toISOString(),
    };

    setWorkDiaryEntries((prev) => [entry, ...prev]);
    addAuditLog(
      'Work Diary Logged',
      'Work Diary ' + entry.id + ' for Contract ' + ctr.id,
      'None',
      entry.hours + ' hours',
    );
    addNotification(
      ctr.clientId,
      'Work Diary Updated',
      ctr.vendorName +
        ' logged ' +
        entry.hours +
        ' hour' +
        (entry.hours === 1 ? '' : 's') +
        ' for "' +
        ctr.jobTitle +
        '".',
      'contract',
      '/contracts/' + ctr.id,
    );

    return entry;
  };
  // 6. Admin State Override
  const adminOverrideBookingState = (
    bookingId: string,
    targetState: BookingState,
    reason: string,
  ) => {
    const req = jobs.find((r) => r.id === bookingId);
    const ctr = contracts.find((c) => c.jobId === bookingId || c.id === bookingId);

    const oldState = req?.status || ctr?.bookingState || 'Unknown';

    // Reviving a terminal state is explicitly forbidden per the admin panel's own rule.
    if (oldState === 'Closed' || oldState === 'Cancelled') return;

    if (req) {
      setJobs((prev) => prev.map((r) => (r.id === bookingId ? { ...r, status: targetState } : r)));
    }

    if (ctr) {
      setContracts((prev) =>
        prev.map((c) => (c.id === ctr.id ? { ...c, bookingState: targetState } : c)),
      );
    }

    addAuditLog('ADMIN OVERRIDE APPLIED', `Booking ${bookingId}`, oldState, targetState, reason);
  };

  const markNotificationRead = (id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  };

  const markAllNotificationsRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const toggleFavoriteConversation = (contractId: string) => {
    setFavoriteConversationIds((prev) =>
      prev.includes(contractId) ? prev.filter((id) => id !== contractId) : [...prev, contractId],
    );
  };

  const toggleSavedTalent = (vendorId: string) => {
    setSavedTalentIds((prev) =>
      prev.includes(vendorId) ? prev.filter((id) => id !== vendorId) : [...prev, vendorId],
    );
  };
  const createReferral = (data: {
    name: string;
    email: string;
    specialty: string;
    note?: string;
  }): Referral => {
    const referral: Referral = {
      id: generateId('ref'),
      clientId: currentUser.id,
      clientName: currentUser.name,
      name: data.name.trim(),
      email: data.email.trim(),
      specialty: data.specialty.trim(),
      note: data.note?.trim() || undefined,
      status: 'invited',
      createdAt: new Date().toISOString(),
    };

    setReferrals((prev) => [referral, ...prev]);
    addAuditLog(
      'Freelancer Referred',
      'Referral ' + referral.id + ' for ' + referral.email,
      'None',
      'Invited',
    );
    return referral;
  };

  const updateClientSettings = (updates: Partial<ClientSettings>) => {
    setClientSettings((prev) => ({ ...prev, ...updates }));
  };

  const updateJobAlertSettings = (updates: Partial<JobAlertSettings>) => {
    setJobAlertSettingsByVendor((prev) => {
      const currentSettings = {
        ...getDefaultJobAlertSettings(currentUser.id),
        ...prev[currentUser.id],
      };
      return {
        ...prev,
        [currentUser.id]: {
          ...currentSettings,
          ...updates,
        },
      };
    });
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
            isPaused ? 'Resumed by Client' : 'Paused by Client',
          );
          return { ...r, status: newStatus, isPaused: !isPaused };
        }
        return r;
      }),
    );
  };

  const deleteJob = (id: string) => {
    // A job with a contract is actively running (or finished) — deleting it would orphan
    // the contract's parent job while the contract keeps existing on its own.
    if (contracts.some((c) => c.jobId === id)) return;
    const job = jobs.find((r) => r.id === id);
    setJobs((prev) => prev.filter((r) => r.id !== id));
    addAuditLog(
      'Job Deleted',
      `Job ${id}`,
      job?.status ?? 'Unknown',
      'Deleted',
      'Removed by Client',
    );
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
    setJobs((prev) => prev.map((r) => (r.id === id ? { ...r, ...normalizedUpdates } : r)));
    addAuditLog(
      'Job Updated',
      `Job ${id}`,
      job?.status ?? 'Unknown',
      job?.status ?? 'Unknown',
      'Edited by Client',
    );
  };

  const getJobById = (id: string) => jobs.find((r) => r.id === id);
  const getProposalsForJob = (reqId: string) => proposals.filter((p) => p.jobId === reqId);
  const getContractByJobId = (reqId: string) => contracts.find((c) => c.jobId === reqId);
  const getContractById = (contractId: string) => contracts.find((c) => c.id === contractId);

  const getReviewForContract = (contractId: string) =>
    reviews.find((review) => review.contractId === contractId);
  const getReviewsForVendor = (vendorId: string) =>
    reviews.filter((review) => review.vendorId === vendorId);
  const getDisputeForContract = (contractId: string) =>
    disputes.find((dispute) => dispute.contractId === contractId && dispute.status !== 'resolved');
  const getWorkDiaryForContract = (contractId: string) =>
    workDiaryEntries
      .filter((entry) => entry.contractId === contractId)
      .sort(
        (a, b) => b.workDate.localeCompare(a.workDate) || b.createdAt.localeCompare(a.createdAt),
      );

  return (
    <AppContext.Provider
      value={{
        currentUser,
        setCurrentUserRole,
        updateCurrentUser,
        isAuthenticated: accessToken !== null,
        accessToken,
        authLoading,
        registerAccount,
        loginWithCredentials,
        loginWithGoogle,
        logoutAccount,
        requestPasswordReset,
        submitPasswordReset,
        verifyEmailToken,
        submitIdentityVerification,
        acceptLegalTerms,
        route,
        navigate,
        goBack,
        jobs,
        proposals,
        contracts,
        auditLogs,
        notifications,
        apiNotifications: apiNotificationsList.data?.items ?? [],
        apiNotificationsLoading: apiNotificationsList.loading,
        apiNotificationsError: apiNotificationsList.error,
        apiNotificationsHasMore: apiNotificationsList.data?.hasNext ?? false,
        loadMoreNotifications,
        apiUnreadCount: apiNotificationsUnread.data?.count ?? 0,
        markApiNotificationRead,
        markAllApiNotificationsRead,
        apiMessagesUnreadCount: apiMessagesUnread.data?.count ?? 0,
        reviews,
        talentProfiles,
        referrals,
        disputes,
        workDiaryEntries,
        favoriteConversationIds,
        toggleFavoriteConversation,
        savedTalentIds,
        toggleSavedTalent,
        createReferral,
        clientSettings,
        updateClientSettings,
        jobAlertSettings,
        updateJobAlertSettings,
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
        vendorMarkCompleted,
        clientConfirmCompletion,
        submitReview,
        raiseDispute,
        addWorkDiaryEntry,
        adminOverrideBookingState,
        markNotificationRead,
        markAllNotificationsRead,
        togglePauseJob,
        deleteJob,
        updateJob,
        getJobById,
        getProposalsForJob,
        getContractByJobId,
        getContractById,
        getReviewForContract,
        getReviewsForVendor,
        getDisputeForContract,
        getWorkDiaryForContract,
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
