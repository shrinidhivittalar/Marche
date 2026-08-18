import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { stdSerializers } from 'pino';
import { PrismaModule } from './prisma/prisma.module';
import { AuditModule } from './audit/audit.module';
import { IdentityModule } from './identity/identity.module';
import { ProfilesModule } from './profiles/profiles.module';
import { MarketplaceModule } from './marketplace/marketplace.module';
import { MediaModule } from './media/media.module';
import { JobsModule } from './jobs/jobs.module';
import { ProposalsModule } from './proposals/proposals.module';
import { NotificationsModule } from './notifications/notifications.module';
import { MessagesModule } from './messages/messages.module';

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
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 100 }]),
    PrismaModule,
    AuditModule,
    IdentityModule,
    ProfilesModule,
    MarketplaceModule,
    MediaModule,
    JobsModule,
    ProposalsModule,
    NotificationsModule,
    MessagesModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
