import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { Message, Prisma } from '@marche/db';

const MESSAGE_FIELDS = {
  id: true,
  connectionId: true,
  senderUserId: true,
  body: true,
  readAt: true,
  createdAt: true,
} satisfies Prisma.MessageSelect;

@Injectable()
export class MessagesRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(connectionId: string, senderUserId: string, body: string): Promise<Message> {
    return this.prisma.client.message.create({
      data: { connectionId, senderUserId, body },
      select: MESSAGE_FIELDS,
    });
  }

  // Newest first, same rule as every other list in this codebase — the
  // frontend re-sorts the page into thread order itself (see
  // MessagesPage.tsx's getContractMessages), the same way it already does
  // for the mock data it replaces.
  listByConnection(connectionId: string, skip: number, take: number) {
    return this.prisma.client.message.findMany({
      where: { connectionId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip,
      take,
      select: MESSAGE_FIELDS,
    });
  }

  countByConnection(connectionId: string): Promise<number> {
    return this.prisma.client.message.count({ where: { connectionId } });
  }

  // Scoped by connectionId in the WHERE clause, not just trusted from the
  // caller — same IDOR-enforcement shape as NotificationsRepository.markRead.
  // Only the other party's messages flip: a sender's own messages were never
  // unread to begin with.
  markConnectionRead(connectionId: string, readerUserId: string): Promise<number> {
    return this.prisma.client.message
      .updateMany({
        where: { connectionId, senderUserId: { not: readerUserId }, readAt: null },
        data: { readAt: new Date() },
      })
      .then((result) => result.count);
  }

  // One row per connection — the most recent message, for the conversation
  // list preview. Prisma's `distinct` combined with this orderBy compiles to
  // Postgres' DISTINCT ON (connectionId), so this is one query rather than
  // one per connection.
  listLatestPerConnection(connectionIds: string[]) {
    if (connectionIds.length === 0) return Promise.resolve([]);
    return this.prisma.client.message.findMany({
      where: { connectionId: { in: connectionIds } },
      distinct: ['connectionId'],
      orderBy: [{ connectionId: 'asc' }, { createdAt: 'desc' }],
      select: MESSAGE_FIELDS,
    });
  }

  // Unread count per connection, for the same preview list's badge. Grouped
  // rather than one count() per connection for the same reason as above.
  async countUnreadPerConnection(
    connectionIds: string[],
    readerUserId: string,
  ): Promise<Map<string, number>> {
    if (connectionIds.length === 0) return new Map();
    const rows = await this.prisma.client.message.groupBy({
      by: ['connectionId'],
      where: {
        connectionId: { in: connectionIds },
        senderUserId: { not: readerUserId },
        readAt: null,
      },
      _count: { _all: true },
    });
    return new Map(rows.map((row) => [row.connectionId, row._count._all]));
  }

  countUnreadForConnections(connectionIds: string[], readerUserId: string): Promise<number> {
    if (connectionIds.length === 0) return Promise.resolve(0);
    return this.prisma.client.message.count({
      where: {
        connectionId: { in: connectionIds },
        senderUserId: { not: readerUserId },
        readAt: null,
      },
    });
  }
}
