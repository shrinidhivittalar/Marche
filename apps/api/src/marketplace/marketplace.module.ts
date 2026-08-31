import { Module } from '@nestjs/common';
import { ProfilesModule } from '../profiles/profiles.module';
import { MediaModule } from '../media/media.module';
import { CategoriesController } from './controllers/categories.controller';
import { ServicesController } from './controllers/services.controller';
import { MarketplaceController } from './controllers/marketplace.controller';
import { CategoryTemplatesController } from './controllers/category-templates.controller';
import { CategoriesRepository } from './repositories/categories.repository';
import { ServicesRepository } from './repositories/services.repository';
import { CategoryTemplatesRepository } from './repositories/category-templates.repository';
import { CategoriesService } from './services/categories.service';
import { ServicesService } from './services/services.service';
import { CategoryTemplatesService } from './services/category-templates.service';

// ProfilesRepository comes from ProfilesModule's exports rather than being
// re-registered here, so both modules share one instance. The marketplace
// only ever reads profiles — it resolves service owners and filters
// discovery by location and availability, and never writes profile data.
@Module({
  imports: [ProfilesModule, MediaModule],
  controllers: [
    CategoriesController,
    ServicesController,
    MarketplaceController,
    CategoryTemplatesController,
  ],
  providers: [
    CategoriesRepository,
    ServicesRepository,
    CategoryTemplatesRepository,
    CategoriesService,
    ServicesService,
    CategoryTemplatesService,
  ],
  // CategoriesRepository is exported for the same reason ProfilesModule
  // exports its own: Jobs needs to check that a category exists before
  // accepting one, and re-registering the repository there would give the
  // two modules separate instances of the same thing.
  //
  // ServicesRepository is exported for SavedProvidersModule, which reuses
  // findProviderCards to render saved-provider cards in the same shape
  // provider search results already use, rather than re-selecting the same
  // fields a second time.
  //
  // CategoryTemplatesService is exported for JobsModule and
  // DirectContractsModule, both of which already import this module for
  // CategoriesRepository/CategoriesService — this is the same shared
  // assertModeAndLocation check both call, not two separate instances of
  // it. CategoryTemplatesRepository is exported alongside it for the same
  // one-instance reasoning CategoriesRepository already has above.
  exports: [
    CategoriesService,
    ServicesService,
    CategoriesRepository,
    ServicesRepository,
    CategoryTemplatesService,
    CategoryTemplatesRepository,
  ],
})
export class MarketplaceModule {}
