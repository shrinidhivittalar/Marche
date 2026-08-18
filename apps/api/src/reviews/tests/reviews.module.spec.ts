import { Test } from '@nestjs/testing';
import { ReviewsModule } from '../reviews.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { PrismaService } from '../../prisma/prisma.service';
import { ReviewsService } from '../services/reviews.service';
import { ReviewsRepository } from '../repositories/reviews.repository';

// Resolves the real module graph, including the transitive imports pulled in
// through ProposalsModule (ConnectionsService) — same reason
// messages.module.spec.ts and marketplace.module.spec.ts exist.
describe('ReviewsModule wiring', () => {
  it('resolves every provider, including ConnectionsService from ProposalsModule', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PrismaModule, ReviewsModule],
    })
      .overrideProvider(PrismaService)
      .useValue({ client: {} })
      .compile();

    expect(moduleRef.get(ReviewsService)).toBeInstanceOf(ReviewsService);
    expect(moduleRef.get(ReviewsRepository)).toBeInstanceOf(ReviewsRepository);
  });
});
