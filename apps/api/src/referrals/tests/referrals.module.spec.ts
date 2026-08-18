import { Test } from '@nestjs/testing';
import { ReferralsModule } from '../referrals.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { PrismaService } from '../../prisma/prisma.service';
import { ReferralsService } from '../services/referrals.service';
import { ReferralsRepository } from '../repositories/referrals.repository';

// Resolves the real module graph, including the transitive imports pulled
// in through ProfilesModule and EmailModule — same reason
// saved-providers.module.spec.ts exists.
describe('ReferralsModule wiring', () => {
  it('resolves every provider, including EmailService from EmailModule', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PrismaModule, ReferralsModule],
    })
      .overrideProvider(PrismaService)
      .useValue({ client: {} })
      .compile();

    expect(moduleRef.get(ReferralsService)).toBeInstanceOf(ReferralsService);
    expect(moduleRef.get(ReferralsRepository)).toBeInstanceOf(ReferralsRepository);
  });
});
