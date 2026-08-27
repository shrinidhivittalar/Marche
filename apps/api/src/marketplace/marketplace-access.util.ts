import { ForbiddenException } from '@nestjs/common';
import type { PlatformRole } from '@marche/db';

// Category management is admin-only. Kept as a service-layer assertion
// rather than a RolesGuard because that is how the codebase already does
// role checks (profiles/profile-access.util.ts) — there is no guard to
// extend, and inventing one here would leave two competing mechanisms.
//
// assertProviderRole and assertOwnership are reused from the Profiles
// module rather than reimplemented; the checks are identical and a second
// copy would be one more place for them to drift.
//
// Checks platformRole, not the legacy User.role — module1-identity-refactor
// closeout fix: this used to check the legacy role scalar (only ever
// 'ADMIN' for pre-Slice-1 accounts backfilled from it), so every admin
// promoted through Slice 6's PATCH /admin/users/:id/platform-role — the
// only way to become an admin now — passed PlatformRoleGuard and then hit
// a 403 here anyway, since their legacy role stays whatever they
// registered with (CLIENT/PROVIDER) and never becomes 'ADMIN'. SUPER_ADMIN
// implicitly satisfies this too, mirroring PlatformRoleGuard's own ranking.
export function assertAdminRole(platformRole: PlatformRole): void {
  if (platformRole !== 'ADMIN' && platformRole !== 'SUPER_ADMIN') {
    throw new ForbiddenException('This action requires an administrator account');
  }
}
