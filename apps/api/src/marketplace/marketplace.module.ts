import { Module } from '@nestjs/common';
import { ProfilesModule } from '../profiles/profiles.module';
import { MediaModule } from '../media/media.module';
import { CategoriesController } from './controllers/categories.controller';
import { ServicesController } from './controllers/services.controller';
import { MarketplaceController } from './controllers/marketplace.controller';
import { CategoriesRepository } from './repositories/categories.repository';
import { ServicesRepository } from './repositories/services.repository';
import { CategoriesService } from './services/categories.service';
import { ServicesService } from './services/services.service';

// ProfilesRepository comes from ProfilesModule's exports rather than being
// re-registered here, so both modules share one instance. The marketplace
// only ever reads profiles — it resolves service owners and filters
// discovery by location and availability, and never writes profile data.
@Module({
  imports: [ProfilesModule, MediaModule],
  controllers: [CategoriesController, ServicesController, MarketplaceController],
  providers: [CategoriesRepository, ServicesRepository, CategoriesService, ServicesService],
  exports: [CategoriesService, ServicesService],
})
export class MarketplaceModule {}
