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
  PASSWORD_RESET_REQUESTED: 'auth.password_reset.requested',
  PASSWORD_RESET_COMPLETED: 'auth.password_reset.completed',
  EMAIL_VERIFIED: 'auth.email_verified',
} as const;
