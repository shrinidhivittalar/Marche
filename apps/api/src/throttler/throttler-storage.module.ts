import { Global, Module } from '@nestjs/common';
import { RedisThrottlerStorage } from './redis-throttler-storage';

// Global like PrismaModule: one Redis-backed storage instance, shared by the
// app-wide ThrottlerGuard (app.module.ts) and EmailThrottlerGuard
// (identity/guards) so every rate limit — IP or email keyed — is enforced
// against the same shared counters instead of a second in-memory one.
//
// REDIS_URL is optional: RedisThrottlerStorage falls back to a per-process
// in-memory store when it's unset, logging a warning rather than failing to
// boot. That fallback loses the two things Redis buys — shared counters
// across instances and survival across a redeploy — so it's a stopgap, not
// a substitute; see the warning in redis-throttler-storage.ts.
@Global()
@Module({
  providers: [
    {
      provide: RedisThrottlerStorage,
      useFactory: () => new RedisThrottlerStorage(process.env.REDIS_URL),
    },
  ],
  exports: [RedisThrottlerStorage],
})
export class ThrottlerStorageModule {}
