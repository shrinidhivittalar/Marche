import { ExecutionContext, ThrottlerException } from '@nestjs/common';
import { ReferralThrottlerGuard } from '../guards/referral-throttler.guard';
import { RedisThrottlerStorage } from '../../throttler/redis-throttler-storage';

function contextWithUserId(userId: string | undefined): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user: userId ? { id: userId } : undefined }),
    }),
    getClass: () => ({ name: 'ReferralsController' }),
    getHandler: () => ({ name: 'create' }),
  } as unknown as ExecutionContext;
}

function storageReturning(isBlocked: boolean) {
  return {
    increment: jest.fn().mockResolvedValue({
      totalHits: 1,
      timeToExpire: 60,
      isBlocked,
      timeToBlockExpire: 0,
    }),
  } as unknown as RedisThrottlerStorage;
}

describe('ReferralThrottlerGuard', () => {
  it('allows the request through while under the per-user limit', async () => {
    const storage = storageReturning(false);
    const guard = new ReferralThrottlerGuard(storage);
    await expect(guard.canActivate(contextWithUserId('user-1'))).resolves.toBe(true);
  });

  it('throws ThrottlerException once the per-user limit is exceeded', async () => {
    const storage = storageReturning(true);
    const guard = new ReferralThrottlerGuard(storage);
    await expect(guard.canActivate(contextWithUserId('user-1'))).rejects.toThrow(
      ThrottlerException,
    );
  });

  it('keys the throttle counter by the authenticated user id, not shared across users', async () => {
    const storage = storageReturning(false);
    const guard = new ReferralThrottlerGuard(storage);

    await guard.canActivate(contextWithUserId('user-1'));
    await guard.canActivate(contextWithUserId('user-2'));

    const keysUsed = (storage.increment as jest.Mock).mock.calls.map((call) => call[0]);
    expect(keysUsed[0]).toContain('user-1');
    expect(keysUsed[1]).toContain('user-2');
    expect(keysUsed[0]).not.toEqual(keysUsed[1]);
  });

  it('fails open when request.user is missing — an unrelated guard is responsible for auth', async () => {
    const storage = storageReturning(true);
    const guard = new ReferralThrottlerGuard(storage);
    await expect(guard.canActivate(contextWithUserId(undefined))).resolves.toBe(true);
    expect(storage.increment).not.toHaveBeenCalled();
  });
});
