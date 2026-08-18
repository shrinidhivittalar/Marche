import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { NotificationsRepository } from '../repositories/notifications.repository';
import { paginate } from '../../marketplace/pagination';
import type { PaginationQueryDto } from '../../profiles/dto/pagination-query.dto';
import type { Notification, Prisma } from '@marche/db';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly notificationsRepository: NotificationsRepository) {}

  // ---------- event creation (internal only — called by other modules'
  // services after their own business transaction has committed) ----------
  //
  // Every method here swallows its own failure. A notification is derived,
  // secondary state (module6.md, "Transaction Boundary"): the business
  // operation that triggered it has already committed by the time any of
  // these run, and a caller like ProposalsService.accept() must not turn
  // into a failed request just because the notification row couldn't be
  // written. Logged so the gap is visible without being fatal.

  async proposalSubmitted(recipientUserId: string, data: Prisma.InputJsonValue): Promise<void> {
    await this.createSafely({
      recipientUserId,
      type: 'PROPOSAL_SUBMITTED',
      title: 'New proposal received',
      message: 'A provider submitted a proposal for your requirement.',
      data,
    });
  }

  async proposalWithdrawn(recipientUserId: string, data: Prisma.InputJsonValue): Promise<void> {
    await this.createSafely({
      recipientUserId,
      type: 'PROPOSAL_WITHDRAWN',
      title: 'Proposal withdrawn',
      message: 'A provider withdrew their proposal.',
      data,
    });
  }

  async proposalAccepted(recipientUserId: string, data: Prisma.InputJsonValue): Promise<void> {
    await this.createSafely({
      recipientUserId,
      type: 'PROPOSAL_ACCEPTED',
      title: 'Proposal accepted',
      message: 'Your proposal was accepted by the client.',
      data,
    });
  }

  async proposalRejected(recipientUserId: string, data: Prisma.InputJsonValue): Promise<void> {
    await this.createSafely({
      recipientUserId,
      type: 'PROPOSAL_REJECTED',
      title: 'Proposal rejected',
      message: 'Your proposal was not selected for this requirement.',
      data,
    });
  }

  async connectionEstablished(
    recipientUserIds: string[],
    data: Prisma.InputJsonValue,
  ): Promise<void> {
    await this.createManySafely(
      recipientUserIds,
      'CONNECTION_ESTABLISHED',
      'Connection established',
      'You are now connected with the other party.',
      data,
    );
  }

  // The only event whose recipients are computed here rather than passed in
  // by the caller: Jobs doesn't have Proposal data (see
  // NotificationsRepository.listSubmittedProviderUserIds), so Notifications
  // resolves "which providers actually proposed on this requirement" itself
  // instead of Jobs reaching into a module it doesn't depend on.
  //
  // Only SUBMITTED proposals — a provider who withdrew, was rejected, or (not
  // reachable under current rules) was accepted has already been told
  // something else, or isn't affected.
  async jobCancelled(jobId: string): Promise<void> {
    try {
      const recipientUserIds =
        await this.notificationsRepository.listSubmittedProviderUserIds(jobId);
      await this.createManySafely(
        recipientUserIds,
        'JOB_CANCELLED',
        'Requirement cancelled',
        'This requirement is no longer accepting proposals.',
        { jobId },
      );
    } catch (error) {
      this.logger.error('Failed to notify providers of job cancellation', error as Error);
    }
  }

  // A client publishing a requirement notifies every provider with a live
  // service in the same category — Job Alerts. Recipients are resolved here
  // rather than passed in, for the same reason as jobCancelled: Jobs has no
  // dependency on Marketplace's Service table, and this module already
  // reads across module boundaries for recipient resolution.
  async jobMatched(jobId: string, categoryId: string, jobTitle: string): Promise<void> {
    try {
      const recipientUserIds =
        await this.notificationsRepository.listProviderUserIdsForCategory(categoryId);
      await this.createManySafely(
        recipientUserIds,
        'JOB_MATCHED',
        'New job matching your services',
        `A new requirement was posted in a category you offer services in: "${jobTitle}"`,
        { jobId },
      );
    } catch (error) {
      this.logger.error('Failed to notify providers of a matching job', error as Error);
    }
  }

  // ---------- reads ----------

  async list(userId: string, pagination: PaginationQueryDto) {
    const { page, limit } = pagination;
    const [data, total] = await Promise.all([
      this.notificationsRepository.listByRecipient(userId, (page - 1) * limit, limit),
      this.notificationsRepository.countByRecipient(userId),
    ]);
    return paginate(data, total, page, limit);
  }

  async unreadCount(userId: string): Promise<{ count: number }> {
    const count = await this.notificationsRepository.countUnread(userId);
    return { count };
  }

  // ---------- read-state writes ----------

  /**
   * Marks one notification read. Repeated calls are safe: a notification
   * already read simply comes back unchanged rather than erroring.
   *
   * 403, not 404, for someone else's notification — matching
   * ProposalsService.getOwnProposal. No route in this module is public, so
   * there is no anonymous caller to hide existence from.
   */
  async markAsRead(userId: string, id: string): Promise<Notification> {
    const notification = await this.notificationsRepository.findById(id);
    if (!notification) {
      throw new NotFoundException('Notification not found');
    }
    if (notification.recipientUserId !== userId) {
      throw new ForbiddenException('You do not have access to this notification');
    }

    if (notification.readAt === null) {
      await this.notificationsRepository.markRead(id, userId);
    }

    return (await this.notificationsRepository.findById(id)) ?? notification;
  }

  async markAllRead(userId: string): Promise<void> {
    await this.notificationsRepository.markAllRead(userId);
  }

  // ---------- helpers ----------

  private async createSafely(input: {
    recipientUserId: string;
    type: Parameters<NotificationsRepository['create']>[0]['type'];
    title: string;
    message: string;
    data: Prisma.InputJsonValue;
  }): Promise<void> {
    try {
      await this.notificationsRepository.create(input);
    } catch (error) {
      this.logger.error(
        `Failed to create ${input.type} notification for user ${input.recipientUserId}`,
        error as Error,
      );
    }
  }

  private async createManySafely(
    recipientUserIds: string[],
    type: Parameters<NotificationsRepository['createMany']>[1],
    title: string,
    message: string,
    data: Prisma.InputJsonValue,
  ): Promise<void> {
    try {
      await this.notificationsRepository.createMany(recipientUserIds, type, title, message, data);
    } catch (error) {
      this.logger.error(`Failed to create ${type} notifications`, error as Error);
    }
  }
}
