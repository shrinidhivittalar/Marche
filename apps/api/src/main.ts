// Must load before anything else is imported: identity.module.ts reads
// process.env.JWT_ACCESS_SECRET at decoration time (JwtModule.register),
// which runs before @nestjs/config's ConfigModule would otherwise get a
// chance to load .env during Nest's instantiation phase.
import 'dotenv/config';
import 'reflect-metadata';
import { validateRequiredEnv } from './config/env.validation';
import { parseCorsOrigins } from './config/cors-origins';

// Must run before AppModule is imported below, for the same reason
// 'dotenv/config' must load first: IdentityModule's JwtModule.register reads
// process.env.JWT_ACCESS_SECRET at decoration time, the moment AppModule (and
// its imports) are require()'d — before Nest exists, and before any
// ConfigModule validation would ever get a chance to run. A missing required
// var throws here instead, with every missing var listed at once.
validateRequiredEnv();

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { RedisIoAdapter } from './messages/gateways/redis-io.adapter';

async function bootstrap() {
  // rawBody: true keeps req.body parsed as JSON everywhere (nothing else
  // changes) while also stashing the exact bytes on req.rawBody. The
  // Razorpay webhook needs those exact bytes — its signature is an HMAC
  // over the raw payload, and re-serializing the parsed JSON is not
  // guaranteed to reproduce byte-for-byte what Razorpay signed.
  const app = await NestFactory.create(AppModule, { bufferLogs: true, rawBody: true });
  app.useLogger(app.get(Logger));

  // Without this, Nest never calls onModuleDestroy on SIGTERM/SIGINT, so
  // PrismaService.onModuleDestroy() (which disconnects the pool) never runs
  // and connections leak on every redeploy.
  app.enableShutdownHooks();

  // Trust exactly one hop (the immediate reverse proxy — Render/Railway/
  // nginx/Cloudflare in front of this service) so req.ip resolves to the
  // real client address instead of the proxy's. Needed for per-client
  // rate limiting (ThrottlerGuard) and IP-based audit/session logging.
  //
  // The correct value depends entirely on proxy topology, not on anything
  // this app controls: it's "how many reverse proxies sit between the
  // client and this process", which is 1 on Render today. If a CDN or any
  // other proxy is ever added in front of Render, this must be reviewed and
  // increased to match the new hop count — leaving it at 1 in that case
  // would let req.ip resolve to the wrong proxy's address.
  app.getHttpAdapter().getInstance().set('trust proxy', 1);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Sets a batch of standard security headers (clickjacking, MIME-sniffing,
  // etc.). CSP disabled here — this is a pure JSON API with no HTML views
  // to protect; the frontend app (a separate service) is where CSP would
  // actually matter, and Swagger's own UI needs looser rules than a strict
  // default would allow.
  app.use(helmet({ contentSecurityPolicy: false }));

  app.use(cookieParser());

  // credentials:true requires an explicit origin — '*' (the default) is
  // rejected by browsers for credentialed (cookie-bearing) requests.
  // CORS_ORIGINS, not FRONTEND_ORIGIN: this is the (possibly larger) set of
  // browser origins allowed to call the API, e.g. a staging frontend that
  // should reach the API but never appears in an emailed link.
  // No localhost fallback: validateRequiredEnv() above already guarantees
  // CORS_ORIGINS is set, in every environment including local dev (see
  // apps/api/.env.example) — a silent fallback here would let a production
  // deploy boot with CORS pointed at localhost instead of failing loudly.
  app.enableCors({
    origin: parseCorsOrigins(process.env.CORS_ORIGINS),
    credentials: true,
  });

  // Fans MessagesGateway's events out across every instance via Redis —
  // required in production (REDIS_URL is already mandatory there for the
  // throttler, see env.validation.ts) and skipped in dev/test, where
  // socket.io's default single-instance in-memory adapter is sufficient.
  if (process.env.REDIS_URL) {
    const redisIoAdapter = new RedisIoAdapter(app);
    redisIoAdapter.connectToRedis(process.env.REDIS_URL);
    app.useWebSocketAdapter(redisIoAdapter);
  }

  if (process.env.NODE_ENV !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Marché API')
      .setDescription('Phase 1 backend — see docs/module1.md for the Identity module spec')
      .setVersion('0.1')
      .addBearerAuth()
      .build();
    const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('docs', app, swaggerDocument);
  }

  const port = process.env.PORT ?? 4000;
  await app.listen(port);
}

bootstrap().catch((error) => {
  // The Nest/pino logger isn't constructed yet if bootstrap fails before
  // NestFactory.create() resolves, so console is the only guaranteed sink.
  // Exiting explicitly (rather than leaving an unhandled rejection) gives
  // the process a clean, immediately-visible failure and correct exit code
  // for Render's crash-loop diagnostics.
  console.error('Fatal error during application startup:', error);
  process.exit(1);
});
