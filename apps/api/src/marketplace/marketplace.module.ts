import { Module } from '@nestjs/common';
import { CategoriesRepository } from './repositories/categories.repository';
import { ServicesRepository } from './repositories/services.repository';

// Stage 2 of module3.md: repositories only. Services and controllers are
// added in the following stages, at which point this module gains its
// controllers array.
@Module({
  providers: [CategoriesRepository, ServicesRepository],
})
export class MarketplaceModule {}
