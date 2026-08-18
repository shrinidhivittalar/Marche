import { Test } from '@nestjs/testing';
import { DisputesModule } from '../disputes.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { PrismaService } from '../../prisma/prisma.service';
import { DisputesService } from '../services/disputes.service';
import { DisputesRepository } from '../repositories/disputes.repository';

// Resolves the real module graph, including the transitive imports pulled
// in through ProposalsModule (ConnectionsService) and NotificationsModule —
// same reason messages.module.spec.ts and reviews.module.spec.ts exist.
describe('DisputesModule wiring', () => {
  it('resolves every provider, including ConnectionsService from ProposalsModule', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PrismaModule, DisputesModule],
    })
      .overrideProvider(PrismaService)
      .useValue({ client: {} })
      .compile();

    expect(moduleRef.get(DisputesService)).toBeInstanceOf(DisputesService);
    expect(moduleRef.get(DisputesRepository)).toBeInstanceOf(DisputesRepository);
  });
});
