import { Module } from '@nestjs/common';
import { ProfilesModule } from '../profiles/profiles.module';
import { ProposalsModule } from '../proposals/proposals.module';
import { ConnectionReviewsController } from './controllers/connection-reviews.controller';
import { ProfileReviewsController } from './controllers/profile-reviews.controller';
import { ClientReviewHistoryController } from './controllers/client-review-history.controller';
import { ReviewsRepository } from './repositories/reviews.repository';
import { ReviewsService } from './services/reviews.service';

// Depends on ProposalsModule for ConnectionsService — eligibility to review
// starts with "is this user a party to this connection, and what is its
// status", and that module already owns both.
@Module({
  imports: [ProfilesModule, ProposalsModule],
  controllers: [
    ConnectionReviewsController,
    ProfileReviewsController,
    ClientReviewHistoryController,
  ],
  providers: [ReviewsRepository, ReviewsService],
})
export class ReviewsModule {}
