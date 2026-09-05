import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConnectionsRepository } from '../../proposals/repositories/connections.repository';
import { ReviewsRepository } from '../repositories/reviews.repository';
import { NotificationsService } from '../../notifications/services/notifications.service';

// Reviews are optional (see reviews.service.ts) — this is the nudge, not an
// enforcement mechanism. A one-time in-app reminder, 3 days after a
// Connection completes, to whichever party hasn't reviewed yet.
const REMINDER_DELAY_DAYS = 3;

@Injectable()
export class ReviewRemindersService {
  private readonly logger = new Logger(ReviewRemindersService.name);

  constructor(
    private readonly connectionsRepository: ConnectionsRepository,
    private readonly reviewsRepository: ReviewsRepository,
    private readonly notificationsService: NotificationsService,
  ) {}

  // Runs once a day. windowStart/windowEnd is a half-open, one-day-wide
  // range anchored on "completed exactly REMINDER_DELAY_DAYS ago" — wide
  // enough to cover a day's worth of completions, narrow enough that a given
  // connection only ever falls inside one day's run, so no separate
  // "already reminded" flag is needed.
  @Cron(CronExpression.EVERY_DAY_AT_9AM)
  async sendReminders(): Promise<void> {
    const windowEnd = new Date();
    windowEnd.setDate(windowEnd.getDate() - REMINDER_DELAY_DAYS);
    const windowStart = new Date(windowEnd);
    windowStart.setDate(windowStart.getDate() - 1);

    const connections = await this.connectionsRepository.findCompletedForReviewReminder(
      windowStart,
      windowEnd,
    );

    for (const connection of connections) {
      try {
        await this.remindPartyIfUnreviewed(connection.id, connection.clientProfile.userId);
        await this.remindPartyIfUnreviewed(connection.id, connection.providerProfile.userId);
      } catch (error) {
        this.logger.error(
          `Failed to send review reminders for connection ${connection.id}`,
          error as Error,
        );
      }
    }
  }

  private async remindPartyIfUnreviewed(connectionId: string, userId: string): Promise<void> {
    const existing = await this.reviewsRepository.findByConnectionAndReviewer(connectionId, userId);
    if (existing) return;

    await this.notificationsService.reviewReminder(userId, { connectionId });
  }
}
