// Identity module's audit event names. Each future module defines its own
// file like this (e.g. jobs/audit-events.ts with 'jobs.created', ...) —
// AuditService itself doesn't know or care about any of these strings.
export const AUTH_EVENTS = {
  REGISTER: 'auth.register',
  // A sign-up attempt against an address that already has an account. The
  // caller cannot tell this happened (the response is identical to a real
  // registration), so the audit log is the only place it is visible — and a
  // burst of these is exactly how an enumeration sweep would look.
  REGISTER_DUPLICATE: 'auth.register.duplicate',
  LOGIN_SUCCESS: 'auth.login.success',
  LOGIN_FAILURE: 'auth.login.failure',
  LOGOUT: 'auth.logout',
  // A refresh token that was already rotated away got presented again.
  // Rotation is single-use, so the only way this happens is a stolen token
  // being replayed after the legitimate holder already moved on to its
  // successor — the signal SECURITY_AUDIT.md finding 5 said was missing.
  REFRESH_TOKEN_REUSE: 'auth.refresh_token.reuse',
  PASSWORD_RESET_REQUESTED: 'auth.password_reset.requested',
  PASSWORD_RESET_COMPLETED: 'auth.password_reset.completed',
  EMAIL_VERIFIED: 'auth.email_verified',
} as const;

// Module 01 Slice 6 — platform-role elevation/demotion
// (module1-implementation-contract.md §5). One event type covers both
// directions; the metadata's previousRole/newRole says which.
export const ADMIN_EVENTS = {
  PLATFORM_ROLE_CHANGED: 'admin.platform_role.changed',
} as const;
