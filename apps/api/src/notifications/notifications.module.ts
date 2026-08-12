import { Module } from '@nestjs/common';
import { NotificationsController } from './controllers/notifications.controller';
import { NotificationsRepository } from './repositories/notifications.repository';
import { NotificationsService } from './services/notifications.service';

// A deliberate leaf: no imports of Jobs or Proposals. Both of those already
// depend on each other in one direction (Proposals -> Jobs), so this module
// stays importable by either without creating a cycle. It knows nothing
// about Job or Proposal business rules — only how to store and serve
// notifications, and how to resolve JobCancelled's recipients via a plain
// Prisma join (see NotificationsRepository.listSubmittedProviderUserIds).
@Module({
  controllers: [NotificationsController],
  providers: [NotificationsRepository, NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
