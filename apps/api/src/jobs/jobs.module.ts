import { Module } from '@nestjs/common';
import { ProfilesModule } from '../profiles/profiles.module';
import { MarketplaceModule } from '../marketplace/marketplace.module';
import { MediaModule } from '../media/media.module';
import { AiModule } from '../ai/ai.module';
import { JobsController } from './controllers/jobs.controller';
import { JobsRepository } from './repositories/jobs.repository';
import { JobsService } from './services/jobs.service';

// ProfilesRepository and CategoriesRepository come from the modules that
// own them rather than being re-registered here, so there is one instance
// of each. Jobs only reads both: it resolves the owning client's profile
// and checks that a category exists, and never writes to either.
//
// JobsService is exported for Module 5, which needs claimFilled when a
// proposal is accepted. That method takes Module 5's transaction client, so
// the FILLED transition still belongs to the module that owns the Job while
// the four writes acceptance makes land together.
@Module({
  imports: [ProfilesModule, MarketplaceModule, MediaModule, AiModule],
  controllers: [JobsController],
  providers: [JobsRepository, JobsService],
  // JobsRepository is exported alongside it because Module 5 reads the Job
  // row directly to decide whether it is accepting proposals — the same
  // read-only dependency Jobs itself has on ProfilesRepository and
  // CategoriesRepository, and for the same reason: one instance, no
  // re-registration, and no write path.
  exports: [JobsService, JobsRepository],
})
export class JobsModule {}
