import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { Notification, NotificationType, Prisma } from '@marche/db';

const NOTIFICATION_FIELDS = {
  id: true,
  type: true,
  title: true,
  message: true,
  data: true,
  readAt: true,
  createdAt: true,
} satisfies Prisma.NotificationSelect;

@Injectable()
export class NotificationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ---------- writes (internal only — no public creation endpoint) ----------

  create(data: {
    recipientUserId: string;
    type: NotificationType;
    title: string;
    message: string;
    data?: Prisma.InputJsonValue;
  }): Promise<Notification> {
    return this.prisma.client.notification.create({ data });
  }

  // For events with more than one recipient (ConnectionEstablished, a Job
  // cancellation reaching several providers). createMany rather than a loop
  // of create() calls, so N recipients is one round trip, not N.
  createMany(
    recipientUserIds: string[],
    type: NotificationType,
    title: string,
    message: string,
    data?: Prisma.InputJsonValue,
  ): Promise<number> {
    if (recipientUserIds.length === 0) return Promise.resolve(0);
    return this.prisma.client.notification
      .createMany({
        data: recipientUserIds.map((recipientUserId) => ({
          recipientUserId,
          type,
          title,
          message,
          data,
        })),
      })
      .then((result) => result.count);
  }

  // ---------- reads ----------

  listByRecipient(recipientUserId: string, skip: number, take: number) {
    return this.prisma.client.notification.findMany({
      where: { recipientUserId },
      // Newest first, id as a tiebreaker — same rule as every other list in
      // this codebase, so same-instant rows still return in a total order.
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip,
      take,
      select: NOTIFICATION_FIELDS,
    });
  }

  countByRecipient(recipientUserId: string): Promise<number> {
    return this.prisma.client.notification.count({ where: { recipientUserId } });
  }

  countUnread(recipientUserId: string): Promise<number> {
    return this.prisma.client.notification.count({
      where: { recipientUserId, readAt: null },
    });
  }

  // The bare row, for the ownership check in the service layer.
  findById(id: string) {
    return this.prisma.client.notification.findUnique({ where: { id } });
  }

  // ---------- read-state writes ----------

  // Scoped by recipientUserId in the WHERE clause, not just the id — this is
  // the actual IDOR enforcement, not merely a service-layer check. Matches
  // zero rows for someone else's notification or an already-read one, so the
  // service can treat "already read" and "not yours" identically at this
  // layer and only needs to distinguish them via the prior findById call.
  markRead(id: string, recipientUserId: string): Promise<number> {
    return this.prisma.client.notification
      .updateMany({
        where: { id, recipientUserId, readAt: null },
        data: { readAt: new Date() },
      })
      .then((result) => result.count);
  }

  markAllRead(recipientUserId: string): Promise<number> {
    return this.prisma.client.notification
      .updateMany({
        where: { recipientUserId, readAt: null },
        data: { readAt: new Date() },
      })
      .then((result) => result.count);
  }

  // ---------- recipient resolution for JobCancelled ----------

  // The one place Notifications reads Proposal data directly rather than
  // through ProposalsRepository. Jobs cannot depend on Proposals (Proposals
  // already depends on Jobs — the reverse would be a module cycle), so this
  // read has to live somewhere that depends on neither: a plain Prisma join,
  // the same way ProposalsRepository.listAttachments reads Media fields
  // directly instead of going through MediaRepository.
  async listSubmittedProviderUserIds(jobId: string): Promise<string[]> {
    const proposals = await this.prisma.client.proposal.findMany({
      where: { jobId, status: 'SUBMITTED' },
      select: { providerProfile: { select: { userId: true } } },
    });
    return proposals.map((proposal) => proposal.providerProfile.userId);
  }
}
