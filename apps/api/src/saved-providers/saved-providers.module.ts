import { Module } from '@nestjs/common';
import { ProfilesModule } from '../profiles/profiles.module';
import { MarketplaceModule } from '../marketplace/marketplace.module';
import { MediaModule } from '../media/media.module';
import { ProfileSaveController } from './controllers/profile-save.controller';
import { SavedProvidersController } from './controllers/saved-providers.controller';
import { SavedProvidersRepository } from './repositories/saved-providers.repository';
import { SavedProvidersService } from './services/saved-providers.service';

// Depends on MarketplaceModule for ServicesRepository.findProviderCards —
// a saved-provider list renders the same card shape provider search
// results already do, and there is no reason to select those fields twice.
@Module({
  imports: [ProfilesModule, MarketplaceModule, MediaModule],
  controllers: [ProfileSaveController, SavedProvidersController],
  providers: [SavedProvidersRepository, SavedProvidersService],
})
export class SavedProvidersModule {}
