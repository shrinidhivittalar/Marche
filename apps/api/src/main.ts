// Must load before anything else is imported: identity.module.ts reads
// process.env.JWT_ACCESS_SECRET at decoration time (JwtModule.register),
// which runs before @nestjs/config's ConfigModule would otherwise get a
// chance to load .env during Nest's instantiation phase.
import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));

  // Without this, Nest never calls onModuleDestroy on SIGTERM/SIGINT, so
  // PrismaService.onModuleDestroy() (which disconnects the pool) never runs
  // and connections leak on every redeploy.
  app.enableShutdownHooks();

  // Trust exactly one hop (the immediate reverse proxy — Render/Railway/
  // nginx/Cloudflare in front of this service) so req.ip resolves to the
  // real client address instead of the proxy's. Needed for per-client
  // rate limiting (ThrottlerGuard) and IP-based audit/session logging.
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
  app.enableCors({
    origin: process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173',
    credentials: true,
  });

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

bootstrap();
