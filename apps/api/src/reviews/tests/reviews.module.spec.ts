import { Test } from '@nestjs/testing';
import { ReviewsModule } from '../reviews.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { PrismaService } from '../../prisma/prisma.service';
import { ReviewsService } from '../services/reviews.service';
import { ReviewsRepository } from '../repositories/reviews.repository';
import { ThrottlerStorageModule } from '../../throttler/throttler-storage.module';

// Resolves the real module graph, including the transitive imports pulled in
// through ProposalsModule (ConnectionsService) — same reason
// messages.module.spec.ts and marketplace.module.spec.ts exist.
// ThrottlerStorageModule is @Global() in the real app but Nest's testing
// module builder doesn't auto-wire globals unless they're actually imported
// — needed here for AiUserThrottlerGuard, pulled in transitively via
// ProposalsModule/MarketplaceModule's AiModule import.
describe('ReviewsModule wiring', () => {
  it('resolves every provider, including ConnectionsService from ProposalsModule', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PrismaModule, ThrottlerStorageModule, ReviewsModule],
    })
      .overrideProvider(PrismaService)
      .useValue({ client: {} })
      .compile();

    expect(moduleRef.get(ReviewsService)).toBeInstanceOf(ReviewsService);
    expect(moduleRef.get(ReviewsRepository)).toBeInstanceOf(ReviewsRepository);
  });
});
