import { Test } from '@nestjs/testing';
import { ReferralsModule } from '../referrals.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { PrismaService } from '../../prisma/prisma.service';
import { ReferralsService } from '../services/referrals.service';
import { ReferralsRepository } from '../repositories/referrals.repository';
import { ThrottlerStorageModule } from '../../throttler/throttler-storage.module';

// Resolves the real module graph, including the transitive imports pulled
// in through ProfilesModule and EmailModule — same reason
// saved-providers.module.spec.ts exists. ThrottlerStorageModule is @Global()
// in the real app but Nest's testing module builder doesn't auto-wire
// globals unless they're actually imported, so ReferralThrottlerGuard's
// RedisThrottlerStorage dependency needs it listed explicitly here.
describe('ReferralsModule wiring', () => {
  it('resolves every provider, including EmailService from EmailModule', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PrismaModule, ThrottlerStorageModule, ReferralsModule],
    })
      .overrideProvider(PrismaService)
      .useValue({ client: {} })
      .compile();

    expect(moduleRef.get(ReferralsService)).toBeInstanceOf(ReferralsService);
    expect(moduleRef.get(ReferralsRepository)).toBeInstanceOf(ReferralsRepository);
  });
});
