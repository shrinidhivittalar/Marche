import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { Prisma, WorkDiaryEntry } from '@marche/db';

// "My entries" (the aggregate Work Diary view) needs to show which
// connection and job each entry belongs to, and who wrote it — the same
// shape reasoning as payments.repository.ts's PAYMENT_WITH_CONNECTION.
const ENTRY_WITH_CONTEXT = {
  id: true,
  note: true,
  createdAt: true,
  authorUserId: true,
  author: { select: { id: true, name: true } },
  connection: {
    select: {
      id: true,
      job: { select: { id: true, title: true } },
      clientProfile: { select: { id: true, displayName: true } },
      providerProfile: { select: { id: true, displayName: true } },
    },
  },
} satisfies Prisma.WorkDiaryEntrySelect;

export type WorkDiaryEntryWithContext = Prisma.WorkDiaryEntryGetPayload<{
  select: typeof ENTRY_WITH_CONTEXT;
}>;

@Injectable()
export class WorkDiaryRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(connectionId: string, authorUserId: string, note: string): Promise<WorkDiaryEntry> {
    return this.prisma.client.workDiaryEntry.create({ data: { connectionId, authorUserId, note } });
  }

  // Oldest first — a log reads chronologically, unlike every other list in
  // this codebase (which reads newest-first).
  listForConnection(connectionId: string): Promise<WorkDiaryEntryWithContext[]> {
    return this.prisma.client.workDiaryEntry.findMany({
      where: { connectionId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: ENTRY_WITH_CONTEXT,
    });
  }

  // The aggregate view (either side of a connection may have written or be
  // reading an entry, so this is keyed on profile ownership of the
  // connection, not authorship of the entry) — newest first, like every
  // other list-mine endpoint.
  listForProfile(
    clientOrProviderProfileId: string,
    skip: number,
    take: number,
  ): Promise<WorkDiaryEntryWithContext[]> {
    return this.prisma.client.workDiaryEntry.findMany({
      where: {
        connection: {
          OR: [
            { clientProfileId: clientOrProviderProfileId },
            { providerProfileId: clientOrProviderProfileId },
          ],
        },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      skip,
      take,
      select: ENTRY_WITH_CONTEXT,
    });
  }

  countForProfile(clientOrProviderProfileId: string): Promise<number> {
    return this.prisma.client.workDiaryEntry.count({
      where: {
        connection: {
          OR: [
            { clientProfileId: clientOrProviderProfileId },
            { providerProfileId: clientOrProviderProfileId },
          ],
        },
      },
    });
  }
}
