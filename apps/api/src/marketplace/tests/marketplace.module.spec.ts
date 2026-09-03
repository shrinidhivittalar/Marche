import { Test } from '@nestjs/testing';
import { MarketplaceModule } from '../marketplace.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { PrismaService } from '../../prisma/prisma.service';
import { CategoriesService } from '../services/categories.service';
import { ServicesService } from '../services/services.service';
import { ServicesRepository } from '../repositories/services.repository';
import { CategoriesRepository } from '../repositories/categories.repository';
import { CategoryTemplatesService } from '../services/category-templates.service';
import { CategoryTemplatesRepository } from '../repositories/category-templates.repository';

// Resolves the real module graph. Unit tests construct services with mocked
// collaborators and would keep passing through a broken wiring change — a
// missing export or a provider that isn't registered only fails at boot,
// which without this test means finding out from a deploy.
describe('MarketplaceModule wiring', () => {
  it('resolves every provider, including ProfilesRepository from ProfilesModule', async () => {
    // PrismaModule is @Global and registered once by AppModule in the real
    // app, so it must be imported explicitly here — overrideProvider
    // replaces an existing provider, it does not introduce one.
    const moduleRef = await Test.createTestingModule({
      imports: [PrismaModule, MarketplaceModule],
    })
      // Overridden so nothing reaches a database while the graph is built;
      // every other provider is the real one.
      .overrideProvider(PrismaService)
      .useValue({ client: {} })
      .compile();

    expect(moduleRef.get(CategoriesService)).toBeInstanceOf(CategoriesService);
    expect(moduleRef.get(ServicesService)).toBeInstanceOf(ServicesService);
    expect(moduleRef.get(ServicesRepository)).toBeInstanceOf(ServicesRepository);
    expect(moduleRef.get(CategoriesRepository)).toBeInstanceOf(CategoriesRepository);
    expect(moduleRef.get(CategoryTemplatesService)).toBeInstanceOf(CategoryTemplatesService);
    expect(moduleRef.get(CategoryTemplatesRepository)).toBeInstanceOf(CategoryTemplatesRepository);
  });
});
