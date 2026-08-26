import { SetMetadata } from '@nestjs/common';

export const PLATFORM_ROLE_KEY = 'requiredPlatformRole';

/**
 * Declarative platform-authority guard, per
 * module1-implementation-contract.md §4.2. Apply alongside JwtAuthGuard
 * (which must run first, to populate request.user) —
 * `@UseGuards(JwtAuthGuard, PlatformRoleGuard)`.
 *
 * SUPER_ADMIN implicitly satisfies an ADMIN requirement (a strict
 * superset, not a separate permission to hold) — see PlatformRoleGuard.
 * There is no `@RequirePlatformRole('USER')`: USER is the default every
 * authenticated request already has, so requiring it is meaningless —
 * use plain `@UseGuards(JwtAuthGuard)` for "any authenticated user."
 */
export const RequirePlatformRole = (role: 'ADMIN' | 'SUPER_ADMIN') =>
  SetMetadata(PLATFORM_ROLE_KEY, role);
