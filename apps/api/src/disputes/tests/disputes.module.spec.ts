import { Test } from '@nestjs/testing';
import { DisputesModule } from '../disputes.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { PrismaService } from '../../prisma/prisma.service';
import { DisputesService } from '../services/disputes.service';
import { DisputesRepository } from '../repositories/disputes.repository';
import { ThrottlerStorageModule } from '../../throttler/throttler-storage.module';

// Resolves the real module graph, including the transitive imports pulled
// in through ProposalsModule (ConnectionsService) and NotificationsModule —
// same reason messages.module.spec.ts and reviews.module.spec.ts exist.
// ThrottlerStorageModule is @Global() in the real app but Nest's testing
// module builder doesn't auto-wire globals unless they're actually imported
// — needed here for AiUserThrottlerGuard, pulled in transitively via
// ProposalsModule/MarketplaceModule's AiModule import.
describe('DisputesModule wiring', () => {
  it('resolves every provider, including ConnectionsService from ProposalsModule', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PrismaModule, ThrottlerStorageModule, DisputesModule],
    })
      .overrideProvider(PrismaService)
      .useValue({ client: {} })
      .compile();

    expect(moduleRef.get(DisputesService)).toBeInstanceOf(DisputesService);
    expect(moduleRef.get(DisputesRepository)).toBeInstanceOf(DisputesRepository);
  });
});
