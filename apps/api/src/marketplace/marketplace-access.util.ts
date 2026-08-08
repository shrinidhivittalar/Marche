import { ForbiddenException } from '@nestjs/common';

// Category management is admin-only. Kept as a service-layer assertion
// rather than a RolesGuard because that is how the codebase already does
// role checks (profiles/profile-access.util.ts) — there is no guard to
// extend, and inventing one here would leave two competing mechanisms.
//
// assertProviderRole and assertOwnership are reused from the Profiles
// module rather than reimplemented; the checks are identical and a second
// copy would be one more place for them to drift.
export function assertAdminRole(role: string): void {
  if (role !== 'ADMIN') {
    throw new ForbiddenException('This action requires an administrator account');
  }
}
