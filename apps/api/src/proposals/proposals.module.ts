import { Module } from '@nestjs/common';
import { ProfilesModule } from '../profiles/profiles.module';
import { JobsModule } from '../jobs/jobs.module';
import { MediaModule } from '../media/media.module';
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
// Nothing here is exported: Contracts and Messaging will read the
// Connection, and that is a decision for whichever module arrives first.
//
// Marketplace is deliberately absent. A proposal never resolves a category
// or a service — it reads a requirement, which already did.
@Module({
  imports: [ProfilesModule, JobsModule, MediaModule],
  controllers: [ProposalsController, JobProposalsController, ConnectionsController],
  providers: [ProposalsRepository, ConnectionsRepository, ProposalsService, ConnectionsService],
})
export class ProposalsModule {}
