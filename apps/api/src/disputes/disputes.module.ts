import { Module } from '@nestjs/common';
import { ProfilesModule } from '../profiles/profiles.module';
import { ProposalsModule } from '../proposals/proposals.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ConnectionDisputesController } from './controllers/connection-disputes.controller';
import { DisputesController } from './controllers/disputes.controller';
import { DisputesRepository } from './repositories/disputes.repository';
import { DisputesService } from './services/disputes.service';

// Depends on ProposalsModule for ConnectionsService (party-authorization —
// same reuse Messages and Reviews already do) and NotificationsModule to
// tell the other party a dispute was raised against them.
@Module({
  imports: [ProfilesModule, ProposalsModule, NotificationsModule],
  controllers: [ConnectionDisputesController, DisputesController],
  providers: [DisputesRepository, DisputesService],
})
export class DisputesModule {}
