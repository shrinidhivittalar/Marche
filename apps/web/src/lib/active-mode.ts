// Active mode — which side of the marketplace the UI is currently
// presenting (hiring vs providing) for a single signed-in identity.
//
// This is presentation state, not identity and not authority:
//
//   currentUser  — who you are (id, email, name, capabilities)
//   activeMode   — which surface you are looking at right now
//
// Switching mode must never change currentUser. The two were conflated
// historically because this app started with one demo persona per role
// (DEMO_USERS / loadUserWithOverrides in AppContext), where "switching
// role" meant swapping the whole user out. That mechanism is demo-only and
// must stay out of the real mode system — a signed-in user who switches
// mode keeps the same id, email, name, capabilities and access token.
//
// Nothing here is a security boundary. The API re-reads the caller's
// capability rows from the database on every request
// (hasCapability/assertClientRole/assertProviderRole) and never trusts a
// mode the client claims to be in. Selecting a mode grants nothing.

import type { BackendCapability } from './api';

export type ActiveMode = 'CLIENT' | 'PROVIDER';

// Stable order, so "the modes available to this user" is deterministic
// rather than dependent on the order the API happened to return rows in.
const MODE_ORDER: ActiveMode[] = ['CLIENT', 'PROVIDER'];

// Capability and mode share their spelling, but they are different things:
// a Capability is a persisted grant, a mode is a view of the UI. Mapping
// them here rather than casting keeps that distinction explicit and means
// a future capability that is not a marketplace surface (or a mode with no
// single backing capability) has one obvious place to be handled.
const MODE_FOR_CAPABILITY: Record<BackendCapability, ActiveMode> = {
  CLIENT: 'CLIENT',
  PROVIDER: 'PROVIDER',
};

/**
 * The modes this user may enter, derived only from their real capability
 * grants. A user with neither capability has no capability-backed mode —
 * an empty list, not a defaulted one.
 */
export function availableModes(capabilities: BackendCapability[] | undefined): ActiveMode[] {
  if (!capabilities?.length) return [];
  const granted = new Set(capabilities.map((capability) => MODE_FOR_CAPABILITY[capability]));
  return MODE_ORDER.filter((mode) => granted.has(mode));
}

/**
 * The mode a user starts in.
 *
 * One capability: that one, unambiguously.
 *
 * Both capabilities, with a `preferred` hint that they actually hold: that
 * one. The hint is the surface the legacy role already put this user on,
 * and honouring it is what keeps a dual-capability user who registered as
 * a provider from being moved into the client UI the first time this code
 * runs. Note what it is not: `preferred` can only ever select between
 * modes already present in `availableModes`, so it never grants anything —
 * a hint for a capability the user lacks is ignored outright. Role is a
 * tiebreaker here, never a source of capability.
 *
 * Both capabilities, no usable hint: CLIENT. Deliberately the app's
 * existing default rather than a new preference — AppContext's own initial
 * state falls back to 'client' when nothing is stored, and App.tsx's
 * roleHome() falls through to the client dashboard.
 *
 * Neither capability: null. There is no marketplace mode to be in, and one
 * is never invented from the legacy User.role scalar — role is not a
 * capability and treating it as one is the exact conflation Module 1
 * removed from the backend.
 */
export function defaultMode(
  capabilities: BackendCapability[] | undefined,
  preferred?: ActiveMode | null,
): ActiveMode | null {
  const modes = availableModes(capabilities);
  if (modes.length === 0) return null;
  if (preferred && modes.includes(preferred)) return preferred;
  return modes.includes('CLIENT') ? 'CLIENT' : modes[0]!;
}

/**
 * Resolves a stored mode against what the user may actually enter now.
 *
 * A stored value is only ever a hint. It is discarded whenever it does not
 * match a current capability, which covers the cases that matter: a
 * capability revoked between sessions, a stored mode belonging to a
 * previously signed-in user, and anything hand-edited into localStorage.
 * In each case the user falls back to their default mode rather than
 * being left in a mode they no longer hold.
 */
export function reconcileMode(
  stored: string | null | undefined,
  capabilities: BackendCapability[] | undefined,
  preferred?: ActiveMode | null,
): ActiveMode | null {
  const modes = availableModes(capabilities);
  const isAvailable = (value: unknown): value is ActiveMode => modes.includes(value as ActiveMode);
  return isAvailable(stored) ? stored : defaultMode(capabilities, preferred);
}

/**
 * The mode a legacy role would have shown, for use only as the `preferred`
 * tiebreaker above. Admin has no marketplace surface, so it maps to null
 * rather than being forced into one.
 */
export function modeForLegacyRole(role: 'client' | 'vendor' | 'admin'): ActiveMode | null {
  if (role === 'vendor') return 'PROVIDER';
  if (role === 'client') return 'CLIENT';
  return null;
}

// Where each surface starts. Declared once so navigation, the route gates
// and the post-switch redirect cannot disagree about what "home" means.
const MODE_HOME: Record<ActiveMode, string> = {
  CLIENT: '/client/dashboard',
  PROVIDER: '/provider/dashboard',
};

// The route prefix each surface owns. Used to decide whether the current
// route still belongs to the surface after a mode switch.
const MODE_PREFIX: Record<ActiveMode, string> = {
  CLIENT: '/client/',
  PROVIDER: '/provider/',
};

export function homePathForMode(mode: ActiveMode): string {
  return MODE_HOME[mode];
}

// Routes that sit under a surface's prefix but are reachable from both
// modes, and so must not trigger a redirect on switch. /client/settings is
// account-level — the only settings screen that exists — and App.tsx's
// route gate excludes it for the same reason. Keep the two in step.
const CROSS_MODE_ROUTES = new Set(['/client/settings']);

/**
 * Whether a route belongs to a surface other than the one given — i.e.
 * whether switching to `mode` strands the user on a page they can no
 * longer reach.
 *
 * Only routes owned by the *other* marketplace surface count. Shared
 * routes (/messages, /notifications, /contracts/:id, /profile/:id, /menu)
 * belong to neither and are valid in both modes, so switching while on one
 * must not move the user — the mode changed, but what they were reading
 * did not. The same holds for the cross-mode exceptions above, which are
 * prefixed like one surface but reachable from both.
 */
export function routeBelongsToOtherMode(route: string, mode: ActiveMode): boolean {
  if (CROSS_MODE_ROUTES.has(route)) return false;
  const other: ActiveMode = mode === 'CLIENT' ? 'PROVIDER' : 'CLIENT';
  return route.startsWith(MODE_PREFIX[other]);
}

/**
 * Which surface to render for a user, including the compatibility path for
 * accounts that carry no capability rows at all.
 *
 * This is NOT capability inference. `availableModes` and `defaultMode`
 * above never look at the legacy role, and no user gains a capability or
 * any authority here. This answers a narrower, presentation-only question:
 * for an account the capability model has nothing to say about, which UI
 * did it already see before this existed — and the answer must stay the
 * same, because changing it would strand real accounts.
 *
 * Two such accounts exist today:
 *   - Google sign-ups, which are created with role 'CLIENT' and zero
 *     capabilities (AuthService.googleLogin grants none by design), and
 *   - any legacy account the Module 1 backfill did not cover.
 *
 * There is currently no UI anywhere for activating a capability, so
 * treating "no capabilities" as "no marketplace UI" would leave those
 * users with a dashboard and nothing else reachable. Once capability
 * activation exists in the frontend, this fallback is what should be
 * removed — it is the whole of the debt this slice takes on.
 */
export function effectiveMode(
  activeMode: ActiveMode | null,
  capabilities: BackendCapability[] | undefined,
  legacyRole: 'client' | 'vendor' | 'admin',
): ActiveMode | null {
  if (availableModes(capabilities).length > 0) return activeMode;
  // Admin returns null here — it is not a marketplace surface, it has its
  // own routes and its own platform-role authorization, and must never be
  // expressed as a CLIENT/PROVIDER mode.
  return modeForLegacyRole(legacyRole);
}
