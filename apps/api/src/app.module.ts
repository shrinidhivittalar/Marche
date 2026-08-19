import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { stdSerializers } from 'pino';
import { PrismaModule } from './prisma/prisma.module';
import { ThrottlerStorageModule } from './throttler/throttler-storage.module';
import { RedisThrottlerStorage } from './throttler/redis-throttler-storage';
import { AuditModule } from './audit/audit.module';
import { IdentityModule } from './identity/identity.module';
import { ProfilesModule } from './profiles/profiles.module';
import { MarketplaceModule } from './marketplace/marketplace.module';
import { MediaModule } from './media/media.module';
import { JobsModule } from './jobs/jobs.module';
import { ProposalsModule } from './proposals/proposals.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ReviewsModule } from './reviews/reviews.module';
import { MessagesModule } from './messages/messages.module';
import { DisputesModule } from './disputes/disputes.module';
import { SavedProvidersModule } from './saved-providers/saved-providers.module';
import { ReferralsModule } from './referrals/referrals.module';
import { PaymentsModule } from './payments/payments.module';
import { DirectContractsModule } from './direct-contracts/direct-contracts.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Structured (JSON) app/request logs — stdout only, nothing persisted
    // to Postgres. In production a hosting platform or log service reads
    // stdout directly; pino-pretty is dev-only, for human-readable output.
    // Redact anything that could leak a credential into logs.
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? 'info',
        transport: process.env.NODE_ENV === 'production' ? undefined : { target: 'pino-pretty' },
        redact: [
          'req.headers.authorization',
          'req.headers.cookie',
          'req.body.password',
          'req.body.newPassword',
          'req.query.token',
        ],
        // Single-use email-verification tokens travel as a `?token=...` query
        // param (see auth.controller.ts#verifyEmail). The `redact` array above
        // masks the parsed req.query.token field, but pino-http's default req
        // serializer also logs the raw req.url string with the token still
        // embedded in it — redact can't scrub a substring out of a string
        // field, so that has to be stripped here instead.
        serializers: {
          req(req) {
            const serialized = stdSerializers.req(req);
            if (serialized.url) {
              serialized.url = serialized.url.replace(/([?&]token=)[^&]+/i, '$1[REDACTED]');
            }
            return serialized;
          },
        },
        autoLogging: { ignore: (req) => Boolean(req.url?.startsWith('/docs')) },
      },
    }),
    // Generous default for the whole API; auth-sensitive routes (login,
    // register, forgot-password, reset-password) set their own tighter
    // @Throttle() limit — see auth.controller.ts.
    //
    // Storage is Redis-backed (ThrottlerStorageModule), not the package
    // default in-memory Map — that resets on every redeploy and is
    // per-instance, so it doesn't actually limit anything once there is more
    // than one API instance.
    ThrottlerStorageModule,
    ThrottlerModule.forRootAsync({
      imports: [ThrottlerStorageModule],
      inject: [RedisThrottlerStorage],
      useFactory: (storage: RedisThrottlerStorage) => ({
        throttlers: [{ name: 'default', ttl: 60_000, limit: 100 }],
        storage,
      }),
    }),
    PrismaModule,
    AuditModule,
    IdentityModule,
    ProfilesModule,
    MarketplaceModule,
    MediaModule,
    JobsModule,
    ProposalsModule,
    NotificationsModule,
    ReviewsModule,
    MessagesModule,
    DisputesModule,
    SavedProvidersModule,
    ReferralsModule,
    PaymentsModule,
    DirectContractsModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
