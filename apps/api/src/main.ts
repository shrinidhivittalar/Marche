// Must load before anything else is imported: identity.module.ts reads
// process.env.JWT_ACCESS_SECRET at decoration time (JwtModule.register),
// which runs before @nestjs/config's ConfigModule would otherwise get a
// chance to load .env during Nest's instantiation phase.
import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.use(cookieParser());

  // credentials:true requires an explicit origin — '*' (the default) is
  // rejected by browsers for credentialed (cookie-bearing) requests.
  app.enableCors({
    origin: process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173',
    credentials: true,
  });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Marche API')
    .setDescription('Phase 1 backend — see docs/module1.md for the Identity module spec')
    .setVersion('0.1')
    .addBearerAuth()
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, swaggerDocument);

  const port = process.env.PORT ?? 4000;
  await app.listen(port);
}

bootstrap();
