import { Module } from '@nestjs/common';
import { ProfilesModule } from '../profiles/profiles.module';
import { ProposalsModule } from '../proposals/proposals.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { MediaModule } from '../media/media.module';
import { ConnectionDisputesController } from './controllers/connection-disputes.controller';
import { DisputesController } from './controllers/disputes.controller';
import { DisputesRepository } from './repositories/disputes.repository';
import { DisputesService } from './services/disputes.service';

// Depends on ProposalsModule for ConnectionsService (party-authorization —
// same reuse Messages and Reviews already do), NotificationsModule to tell
// the other party a dispute was raised against them, and MediaModule for
// the same "is this file theirs and finished uploading" check Jobs already
// uses before attaching evidence.
@Module({
  imports: [ProfilesModule, ProposalsModule, NotificationsModule, MediaModule],
  controllers: [ConnectionDisputesController, DisputesController],
  providers: [DisputesRepository, DisputesService],
})
export class DisputesModule {}
