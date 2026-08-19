import { Module } from '@nestjs/common';
import { ProfilesModule } from '../profiles/profiles.module';
import { JobsModule } from '../jobs/jobs.module';
import { MarketplaceModule } from '../marketplace/marketplace.module';
import { ProposalsModule } from '../proposals/proposals.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { DirectContractsController } from './controllers/direct-contracts.controller';
import { DirectContractsService } from './services/direct-contracts.service';

// ProfilesModule for both parties' profiles, JobsModule for JobsRepository's
// claimFilled (the DRAFT -> FILLED transition on provider accept),
// MarketplaceModule for CategoriesRepository, ProposalsModule for
// ProposalsRepository and ConnectionsRepository — same reuse the
// marketplace hire flow itself is built from, not a duplicate set of
// dependencies for a duplicate concept.
@Module({
  imports: [ProfilesModule, JobsModule, MarketplaceModule, ProposalsModule, NotificationsModule],
  controllers: [DirectContractsController],
  providers: [DirectContractsService],
})
export class DirectContractsModule {}
