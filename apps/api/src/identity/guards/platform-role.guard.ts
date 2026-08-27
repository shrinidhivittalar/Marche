import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { PLATFORM_ROLE_KEY } from '../decorators/require-platform-role.decorator';
import type { AuthenticatedUser } from '../strategies/jwt.strategy';

// Ordered so a higher authority satisfies any lower requirement —
// SUPER_ADMIN is a strict superset of ADMIN, not a separate permission set
// (module1-implementation-contract.md §4.2).
const RANK: Record<string, number> = { USER: 0, ADMIN: 1, SUPER_ADMIN: 2 };

/**
 * Route-level platform-authority check. Must run after JwtAuthGuard (which
 * populates request.user) — apply as
 * `@UseGuards(JwtAuthGuard, PlatformRoleGuard)`.
 *
 * request.user.platformRole comes from JwtStrategy.validate, which
 * re-fetches it from the database on every request — this guard never
 * reads a role out of the raw JWT payload.
 */
@Injectable()
export class PlatformRoleGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.get<string | undefined>(
      PLATFORM_ROLE_KEY,
      context.getHandler(),
    );
    if (!required) return true; // no @RequirePlatformRole on this route

    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const actual = request.user?.platformRole;
    const actualRank = actual ? RANK[actual] : undefined;
    const requiredRank = RANK[required] ?? Number.POSITIVE_INFINITY;

    if (actualRank === undefined || actualRank < requiredRank) {
      throw new ForbiddenException('This action requires administrator authority');
    }
    return true;
  }
}
