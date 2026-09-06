import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import type { Request } from 'express';
import { RedisThrottlerStorage } from '../../throttler/redis-throttler-storage';
import type { AuthenticatedUser } from '../../identity/strategies/jwt.strategy';

// Complements the IP-keyed @Throttle(AI_THROTTLE) already on every AI route
// (same 15/60s limit, kept in sync with it deliberately — see the comment
// next to each). IP-keying alone misses one account rotating IPs to run up
// the Groq bill without limit; this closes that gap the same way
// ReferralThrottlerGuard closes the account-vs-IP gap on /referrals. Must
// run after JwtAuthGuard (which populates request.user) — apply as
// `@UseGuards(JwtAuthGuard, AiUserThrottlerGuard)` (or with PlatformRoleGuard
// alongside it, for admin-only AI routes).
//
// Shares RedisThrottlerStorage with the app-wide ThrottlerGuard, so this is
// one shared-storage limiter, not a second in-memory one.
const AI_USER_RATE_LIMIT = 15;
const AI_USER_RATE_LIMIT_TTL_MS = 60_000;

@Injectable()
export class AiUserThrottlerGuard implements CanActivate {
  constructor(private readonly storage: RedisThrottlerStorage) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const userId = req.user?.id;
    // No user to key on means an earlier auth guard already rejected the
    // request — never reached in practice, but fail open rather than throw
    // on an unrelated guard's job.
    if (!userId) {
      return true;
    }

    const key = `${context.getClass().name}:${context.getHandler().name}:${userId}`;
    const { isBlocked } = await this.storage.increment(
      key,
      AI_USER_RATE_LIMIT_TTL_MS,
      AI_USER_RATE_LIMIT,
      AI_USER_RATE_LIMIT_TTL_MS,
      'ai-user',
    );

    if (isBlocked) {
      throw new ThrottlerException();
    }
    return true;
  }
}
