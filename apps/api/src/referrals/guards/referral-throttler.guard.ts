import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import type { Request } from 'express';
import { RedisThrottlerStorage } from '../../throttler/redis-throttler-storage';
import type { AuthenticatedUser } from '../../identity/strategies/jwt.strategy';

// Complements the app-wide IP-keyed ThrottlerGuard (100/min, shared by every
// route). That limit is useless against this endpoint's real attack: one
// verified account sending referral invites — real emails, attacker-authored
// name/specialty/note text — to arbitrary addresses. IP-keying does nothing
// once the account, not the IP, is the abuse unit. Must run after
// JwtAuthGuard (which populates request.user) — apply as
// `@UseGuards(JwtAuthGuard, ReferralThrottlerGuard)`.
//
// Shares RedisThrottlerStorage with the app-wide ThrottlerGuard, same as
// EmailThrottlerGuard, so this is one shared-storage limiter, not a second
// in-memory one.
const REFERRAL_RATE_LIMIT = 10;
const REFERRAL_RATE_LIMIT_TTL_MS = 60 * 60_000; // 1 hour

@Injectable()
export class ReferralThrottlerGuard implements CanActivate {
  constructor(private readonly storage: RedisThrottlerStorage) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const userId = req.user?.id;
    // No user to key on means JwtAuthGuard already rejected the request —
    // never reached in practice, but fail open rather than throw on an
    // unrelated guard's job.
    if (!userId) {
      return true;
    }

    const key = `${context.getClass().name}:${context.getHandler().name}:${userId}`;
    const { isBlocked } = await this.storage.increment(
      key,
      REFERRAL_RATE_LIMIT_TTL_MS,
      REFERRAL_RATE_LIMIT,
      REFERRAL_RATE_LIMIT_TTL_MS,
      'referral',
    );

    if (isBlocked) {
      throw new ThrottlerException();
    }
    return true;
  }
}
