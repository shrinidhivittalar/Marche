import { Module } from '@nestjs/common';
import { ProfilesModule } from '../profiles/profiles.module';
import { ProposalsModule } from '../proposals/proposals.module';
import { ConnectionReviewsController } from './controllers/connection-reviews.controller';
import { ProfileReviewsController } from './controllers/profile-reviews.controller';
import { ClientReviewHistoryController } from './controllers/client-review-history.controller';
import { ReviewsRepository } from './repositories/reviews.repository';
import { ReviewsService } from './services/reviews.service';

// Depends on ProposalsModule for ConnectionsService/ConnectionsRepository —
// eligibility to review starts with "is this user a party to this
// connection, and what is its status", and that module already owns both;
// ReviewsService.projectStatsForProfile also reuses ConnectionsRepository's
// completed-connection count from here rather than duplicating it.
//
// ReviewsService is exported so ProfilesService can resolve it lazily via
// ModuleRef (see profiles/services/profiles.service.ts) to fill in the
// public profile view's statistics — a plain static import back into
// ProfilesModule would make this a real circular module import; see the
// comment on profiles.module.ts's imports array for why that was reverted.
@Module({
  imports: [ProfilesModule, ProposalsModule],
  controllers: [
    ConnectionReviewsController,
    ProfileReviewsController,
    ClientReviewHistoryController,
  ],
  providers: [ReviewsRepository, ReviewsService],
  exports: [ReviewsService],
})
export class ReviewsModule {}
