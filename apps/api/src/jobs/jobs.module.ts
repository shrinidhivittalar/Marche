import { Module } from '@nestjs/common';
import { ProfilesModule } from '../profiles/profiles.module';
import { MarketplaceModule } from '../marketplace/marketplace.module';
import { JobsController } from './controllers/jobs.controller';
import { JobsRepository } from './repositories/jobs.repository';
import { JobsService } from './services/jobs.service';

// ProfilesRepository and CategoriesRepository come from the modules that
// own them rather than being re-registered here, so there is one instance
// of each. Jobs only reads both: it resolves the owning client's profile
// and checks that a category exists, and never writes to either.
//
// JobsService is exported for Module 5, which needs markFilled when a
// proposal is accepted.
@Module({
  imports: [ProfilesModule, MarketplaceModule],
  controllers: [JobsController],
  providers: [JobsRepository, JobsService],
  exports: [JobsService],
})
export class JobsModule {}
