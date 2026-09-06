import { Test } from '@nestjs/testing';
import { MessagesModule } from '../messages.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { PrismaService } from '../../prisma/prisma.service';
import { MessagesService } from '../services/messages.service';
import { MessagesRepository } from '../repositories/messages.repository';
import { MessagesGateway } from '../gateways/messages.gateway';
import { ThrottlerStorageModule } from '../../throttler/throttler-storage.module';

// Resolves the real module graph, including the transitive imports pulled in
// through ProposalsModule (ConnectionsService/ConnectionsRepository) — the
// same reason marketplace.module.spec.ts exists: a missing export or an
// unregistered provider only fails at boot, which without this test means
// finding out from a deploy. ThrottlerStorageModule is @Global() in the real
// app but Nest's testing module builder doesn't auto-wire globals unless
// they're actually imported — needed here for AiUserThrottlerGuard, pulled
// in transitively via ProposalsModule/MarketplaceModule's AiModule import.
describe('MessagesModule wiring', () => {
  it('resolves every provider, including ConnectionsService from ProposalsModule', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PrismaModule, ThrottlerStorageModule, MessagesModule],
    })
      .overrideProvider(PrismaService)
      .useValue({ client: {} })
      .compile();

    expect(moduleRef.get(MessagesService)).toBeInstanceOf(MessagesService);
    expect(moduleRef.get(MessagesRepository)).toBeInstanceOf(MessagesRepository);
    expect(moduleRef.get(MessagesGateway)).toBeInstanceOf(MessagesGateway);
  });
});
