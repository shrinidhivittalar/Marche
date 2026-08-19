import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import type { Request } from 'express';
import { RedisThrottlerStorage } from '../../throttler/redis-throttler-storage';
import { AUTH_RATE_LIMIT, AUTH_RATE_LIMIT_TTL_MS } from '../auth-rate-limit';

// Complements the IP-keyed @Throttle(AUTH_THROTTLE) already on these routes.
// IP alone misses two attacks: credential stuffing spread across many IPs
// against one account (login), and mail-bombing a victim address with
// verification/reset emails from many IPs (register, forgot-password).
// Keying on the email in the body catches both — same limit and window as
// the IP-keyed throttle, reusing AUTH_RATE_LIMIT rather than adding a second
// number to keep in sync.
//
// Shares RedisThrottlerStorage with the app-wide ThrottlerGuard so this is
// one shared-storage rate limiter, not a second in-memory one.
@Injectable()
export class EmailThrottlerGuard implements CanActivate {
  constructor(private readonly storage: RedisThrottlerStorage) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const email =
      typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : undefined;
    // No email to key on — the route's own DTO validation (@IsEmail) rejects
    // this request on its own; the IP-keyed throttle still applies regardless.
    if (!email) {
      return true;
    }

    const key = `${context.getClass().name}:${context.getHandler().name}:${email}`;
    const { isBlocked } = await this.storage.increment(
      key,
      AUTH_RATE_LIMIT_TTL_MS,
      AUTH_RATE_LIMIT,
      AUTH_RATE_LIMIT_TTL_MS,
      'email',
    );

    if (isBlocked) {
      throw new ThrottlerException();
    }
    return true;
  }
}
