import { Test } from '@nestjs/testing';
import { SavedProvidersModule } from '../saved-providers.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { PrismaService } from '../../prisma/prisma.service';
import { SavedProvidersService } from '../services/saved-providers.service';
import { SavedProvidersRepository } from '../repositories/saved-providers.repository';

// Resolves the real module graph, including the transitive imports pulled
// in through MarketplaceModule (ServicesRepository) and MediaModule
// (MediaService) — same reason messages.module.spec.ts and
// marketplace.module.spec.ts exist.
describe('SavedProvidersModule wiring', () => {
  it('resolves every provider, including ServicesRepository from MarketplaceModule', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PrismaModule, SavedProvidersModule],
    })
      .overrideProvider(PrismaService)
      .useValue({ client: {} })
      .compile();

    expect(moduleRef.get(SavedProvidersService)).toBeInstanceOf(SavedProvidersService);
    expect(moduleRef.get(SavedProvidersRepository)).toBeInstanceOf(SavedProvidersRepository);
  });
});
