import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { SavedProvider } from '@marche/db';

@Injectable()
export class SavedProvidersRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(clientProfileId: string, providerProfileId: string): Promise<SavedProvider> {
    return this.prisma.client.savedProvider.create({
      data: { clientProfileId, providerProfileId },
    });
  }

  find(clientProfileId: string, providerProfileId: string) {
    return this.prisma.client.savedProvider.findUnique({
      where: { clientProfileId_providerProfileId: { clientProfileId, providerProfileId } },
    });
  }

  delete(clientProfileId: string, providerProfileId: string): Promise<SavedProvider> {
    return this.prisma.client.savedProvider.delete({
      where: { clientProfileId_providerProfileId: { clientProfileId, providerProfileId } },
    });
  }

  // Newest-saved first, with id as a tiebreaker — same rule as every other
  // list in this codebase.
  listByClient(clientProfileId: string, skip: number, take: number) {
    return this.prisma.client.savedProvider.findMany({
      where: { clientProfileId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip,
      take,
    });
  }

  countByClient(clientProfileId: string): Promise<number> {
    return this.prisma.client.savedProvider.count({ where: { clientProfileId } });
  }
}
