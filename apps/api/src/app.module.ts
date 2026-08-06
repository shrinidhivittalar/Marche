import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { PrismaModule } from './prisma/prisma.module';
import { AuditModule } from './audit/audit.module';
import { IdentityModule } from './identity/identity.module';
import { ProfilesModule } from './profiles/profiles.module';

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
        ],
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
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
