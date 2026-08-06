import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { prisma } from '@marche/db';

// Thin injectable wrapper so Nest's DI container can hand the shared
// @marche/db client to services, instead of importing the singleton directly.
@Injectable()
export class PrismaService implements OnModuleDestroy {
  readonly client = prisma;

  async onModuleDestroy() {
    await this.client.$disconnect();
  }
}
