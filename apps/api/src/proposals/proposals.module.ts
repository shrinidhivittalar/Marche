import { Module } from '@nestjs/common';
import { ProfilesModule } from '../profiles/profiles.module';
import { JobsModule } from '../jobs/jobs.module';
import { MediaModule } from '../media/media.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ProposalsController } from './controllers/proposals.controller';
import { JobProposalsController } from './controllers/job-proposals.controller';
import { ConnectionsController } from './controllers/connections.controller';
import { ProposalsRepository } from './repositories/proposals.repository';
import { ConnectionsRepository } from './repositories/connections.repository';
import { ProposalsService } from './services/proposals.service';
import { ConnectionsService } from './services/connections.service';

// ProfilesRepository, JobsRepository and JobsService come from the modules
// that own them rather than being re-registered here, so there is one
// instance of each — the same arrangement Jobs has with Profiles and
// Marketplace.
//
// Jobs is the only module Proposals writes to, and only through
// JobsService.claimFilled, which takes this module's transaction client so
// the FILLED transition stays defined where the Job lifecycle lives.
//
// Marketplace is deliberately absent. A proposal never resolves a category
// or a service — it reads a requirement, which already did.
@Module({
  imports: [ProfilesModule, JobsModule, MediaModule, NotificationsModule],
  controllers: [ProposalsController, JobProposalsController, ConnectionsController],
  providers: [ProposalsRepository, ConnectionsRepository, ProposalsService, ConnectionsService],
  // ConnectionsService (party-checked single-connection read) and
  // ConnectionsRepository (unpaginated id listing) are exported for
  // MessagesModule — messaging is scoped to the two parties on a
  // Connection, and this is where that check already lives. Contracts will
  // read the Connection too, whenever that module arrives.
  exports: [ConnectionsService, ConnectionsRepository],
})
export class ProposalsModule {}
