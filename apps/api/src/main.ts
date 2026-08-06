// Must load before anything else is imported: identity.module.ts reads
// process.env.JWT_ACCESS_SECRET at decoration time (JwtModule.register),
// which runs before @nestjs/config's ConfigModule would otherwise get a
// chance to load .env during Nest's instantiation phase.
import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
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

  app.enableCors({ credentials: true });

  const port = process.env.PORT ?? 4000;
  await app.listen(port);
}

bootstrap();
