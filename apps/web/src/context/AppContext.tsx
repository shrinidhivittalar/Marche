import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { useApiResource } from '../hooks/useApiResource';
import { usePolling } from '../hooks/usePolling';
import { notificationsApi, type ApiNotification } from '../lib/notifications-api';
import { messagesApi } from '../lib/messages-api';
import {
  User,
  UserRole,
  Job,
  AuditLogEntry,
  Notification,
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
  INITIAL_AUDIT_LOGS,
  INITIAL_NOTIFICATIONS,
  INITIAL_TALENT,
} from '../data/mockData';
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
import {
  availableModes as deriveAvailableModes,
  effectiveMode,
  homePathForMode,
  modeForLegacyRole,
  reconcileMode,
  routeBelongsToOtherMode,
  type ActiveMode,
} from '../lib/active-mode';

interface AppContextType {
  currentUser: User;
  // Demo-only. Replaces the entire user with a DEMO_USERS persona — see the
  // implementation. It is NOT the mode switcher: activeMode/setActiveMode
  // below are, and they never touch currentUser.
  setCurrentUserRole: (role: UserRole) => void;
  updateCurrentUser: (updates: Partial<User>) => void;
  // Which side of the marketplace the UI is presenting. Presentation state
  // only — switching it changes no identity, no token, and grants nothing;
  // the API re-checks capabilities per request. null means this account has
  // no capability-backed marketplace mode. See lib/active-mode.ts.
  activeMode: ActiveMode | null;
  // What the UI should actually present: activeMode, plus the legacy
  // compatibility fallback for accounts holding no capability rows at all
  // (see effectiveMode). This — not activeMode — is what route gates and
  // navigation must both read, so they cannot disagree about which surface
  // a Google sign-up or un-backfilled account is on.
  surface: ActiveMode | null;
  // The modes this user may enter, derived from their real capability
  // grants. Empty for an account holding no capabilities.
  availableModes: ActiveMode[];
  // Ignores any mode the user does not hold, so a stale caller or a
  // hand-crafted call cannot put the UI into an unavailable mode.
  setActiveMode: (mode: ActiveMode) => void;
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

  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;

  // Helper helpers
  getReviewsForVendor: (vendorId: string) => Review[];
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const LOCAL_STORAGE_KEY = 'marche_app_state_v8';

// Kept separate from the `_user_role` key below, which persists the legacy
// demo-persona role and is read back as the initial currentUser. This one
// holds only a mode name — never identity — and is always validated
// against the signed-in user's real capabilities before being applied, so
// a value left behind by a previous user cannot carry into the next one.
const ACTIVE_MODE_KEY = `${LOCAL_STORAGE_KEY}_active_mode`;
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

  // The user's raw mode preference — what they last chose, or what was left
  // in storage. Deliberately NOT the mode the app runs on: it is only a
  // hint, and is validated against real capabilities on every render below.
  // Kept separate from currentUser so switching mode cannot touch identity.
  const [preferredMode, setPreferredMode] = useState<string | null>(() =>
    localStorage.getItem(ACTIVE_MODE_KEY),
  );

  const availableModes = useMemo(
    () => deriveAvailableModes(currentUser.capabilities),
    [currentUser.capabilities],
  );

  // Derived during render rather than mirrored into state by an effect, so
  // there is no window in which the app runs on a stale mode. Capabilities
  // arrive after the silent refresh and can change between sessions (a
  // grant added or revoked, or a different user signing in on this
  // browser); recomputing here is what stops a stored mode outliving the
  // capability that justified it.
  //
  // The legacy role is the tiebreaker for a dual-capability user with
  // nothing stored: it is the surface they are already on, so honouring it
  // keeps this change invisible to them instead of relocating a provider
  // into the client UI. It can only ever select between capabilities they
  // already hold — see defaultMode.
  const activeMode = useMemo(
    () =>
      reconcileMode(preferredMode, currentUser.capabilities, modeForLegacyRole(currentUser.role)),
    [preferredMode, currentUser.capabilities, currentUser.role],
  );

  // Only ever writes, never clears. On a full page load capabilities have
  // not arrived yet, so activeMode is briefly null for everyone —
  // clearing here would delete the stored preference on every reload, and
  // lose it outright for anyone who closed the tab during the silent
  // refresh. Nothing is lost by leaving a stale value behind instead:
  // reconcileMode rejects a mode the user cannot enter, and logout removes
  // the key explicitly.
  useEffect(() => {
    if (activeMode) {
      localStorage.setItem(ACTIVE_MODE_KEY, activeMode);
    }
  }, [activeMode]);

  // What the UI presents. activeMode is the capability-backed answer;
  // this adds the legacy fallback for accounts with no capability rows, so
  // route gates and navigation read one value rather than each deriving
  // their own and disagreeing.
  const surface = useMemo(
    () => effectiveMode(activeMode, currentUser.capabilities, currentUser.role),
    [activeMode, currentUser.capabilities, currentUser.role],
  );

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
  const [jobs] = useState<Job[]>(() => {
    const saved = localStorage.getItem(`${LOCAL_STORAGE_KEY}_jobs`);
    return saved ? JSON.parse(saved) : INITIAL_JOBS;
  });

  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>(() => {
    const saved = localStorage.getItem(`${LOCAL_STORAGE_KEY}_audit`);
    return saved ? JSON.parse(saved) : INITIAL_AUDIT_LOGS;
  });

  const [notifications, setNotifications] = useState<Notification[]>(() => {
    const saved = localStorage.getItem(`${LOCAL_STORAGE_KEY}_notifications`);
    return saved ? JSON.parse(saved) : INITIAL_NOTIFICATIONS;
  });

  const [reviews] = useState<Review[]>(() => {
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
  const [disputes] = useState<Dispute[]>(() => {
    const saved = localStorage.getItem(`${LOCAL_STORAGE_KEY}_disputes`);
    return saved ? JSON.parse(saved) : [];
  });
  const [workDiaryEntries] = useState<WorkDiaryEntry[]>(() => {
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
    localStorage.setItem(
      `${LOCAL_STORAGE_KEY}_job_alert_settings`,
      JSON.stringify(jobAlertSettingsByVendor),
    );
  }, [
    currentUser,
    jobs,
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

  // Defined here, below navigate, because switching mode may need to move
  // the user — see below.
  //
  // Never widens access: a mode the user does not hold is ignored outright
  // rather than clamped to something else, so a bad call is a no-op instead
  // of a silent redirect somewhere unexpected. Note what this does NOT do —
  // it does not call setCurrentUser, so id, email, name, capabilities and
  // the access token are all untouched by a mode switch.
  //
  // The redirect is deliberate rather than left to the route gate. Both end
  // up on the new surface's home, but relying on the gate means rendering a
  // bounce the user did not ask for; doing it here makes the mode switch
  // itself the navigation. Only fires when the current route belongs to the
  // surface being left — shared routes (/messages, /contracts/:id, ...) are
  // valid in either mode, and switching while reading one must not throw
  // the user out of it.
  const setActiveMode = (mode: ActiveMode) => {
    if (!availableModes.includes(mode)) return;
    setPreferredMode(mode);
    if (routeBelongsToOtherMode(route, mode)) {
      navigate(homePathForMode(mode));
    }
  };

  // Demo/legacy only — NOT the mode switcher, despite the name.
  //
  // This swaps the entire user out for a DEMO_USERS persona, which for a
  // real signed-in user would silently replace their id, email, name and
  // capabilities while leaving the access token valid — the session and
  // the displayed identity would then disagree. Real mode switching is
  // setActiveMode, which changes presentation state only.
  //
  // Left in place rather than deleted: it is still part of the signed-out
  // demo experience this app falls back to (see loadUserWithOverrides and
  // the DEMO_USERS initial state), and removing it is a separate decision
  // about that fallback, not part of introducing activeMode. It currently
  // has no callers outside this file, and must not gain one.
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
    // Cleared explicitly, in both state and storage: the next user to sign
    // in on this browser must not inherit this one's preference.
    // Reconciliation would also reject it once their capabilities arrive,
    // but clearing it here means it is gone immediately, and the write-only
    // effect above deliberately never removes it.
    setPreferredMode(null);
    localStorage.removeItem(ACTIVE_MODE_KEY);
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

  const getReviewsForVendor = (vendorId: string) =>
    reviews.filter((review) => review.vendorId === vendorId);

  return (
    <AppContext.Provider
      value={{
        currentUser,
        setCurrentUserRole,
        activeMode,
        surface,
        availableModes,
        setActiveMode,
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
        markNotificationRead,
        markAllNotificationsRead,
        getReviewsForVendor,
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
