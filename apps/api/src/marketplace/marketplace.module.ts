import { Module } from '@nestjs/common';
import { ProfilesModule } from '../profiles/profiles.module';
import { CategoriesRepository } from './repositories/categories.repository';
import { ServicesRepository } from './repositories/services.repository';
import { CategoriesService } from './services/categories.service';
import { ServicesService } from './services/services.service';

// Stage 3 of module3.md: repositories and business logic. Controllers are
// added in the next stage, at which point this module gains its
// controllers array.
//
// ProfilesRepository comes from ProfilesModule's exports rather than being
// re-registered here, so both modules share one instance. The marketplace
// only ever reads profiles — it resolves service owners and filters
// discovery by location and availability, and never writes profile data.
@Module({
  imports: [ProfilesModule],
  providers: [CategoriesRepository, ServicesRepository, CategoriesService, ServicesService],
  exports: [CategoriesService, ServicesService],
})
export class MarketplaceModule {}
