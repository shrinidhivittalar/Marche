import { Global, Module } from '@nestjs/common';
import { RedisThrottlerStorage } from './redis-throttler-storage';

// Global like PrismaModule: one Redis-backed storage instance, shared by the
// app-wide ThrottlerGuard (app.module.ts) and EmailThrottlerGuard
// (identity/guards) so every rate limit — IP or email keyed — is enforced
// against the same shared counters instead of a second in-memory one.
@Global()
@Module({
  providers: [
    {
      provide: RedisThrottlerStorage,
      useFactory: () => {
        const redisUrl = process.env.REDIS_URL;
        if (!redisUrl) {
          throw new Error(
            'REDIS_URL is not set. Rate limiting is shared-storage only — see .env.example.',
          );
        }
        return new RedisThrottlerStorage(redisUrl);
      },
    },
  ],
  exports: [RedisThrottlerStorage],
})
export class ThrottlerStorageModule {}
