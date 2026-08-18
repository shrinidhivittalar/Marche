import { Module } from '@nestjs/common';
import { ProfilesModule } from '../profiles/profiles.module';
import { ProposalsModule } from '../proposals/proposals.module';
import { ConnectionMessagesController } from './controllers/connection-messages.controller';
import { MessagesController } from './controllers/messages.controller';
import { MessagesRepository } from './repositories/messages.repository';
import { MessagesService } from './services/messages.service';

// Depends on ProposalsModule for ConnectionsService/ConnectionsRepository —
// a message only exists on a Connection, and that module already owns "is
// this user a party to this connection". Messages doesn't re-derive that
// check, only reuses it.
@Module({
  imports: [ProfilesModule, ProposalsModule],
  controllers: [ConnectionMessagesController, MessagesController],
  providers: [MessagesRepository, MessagesService],
})
export class MessagesModule {}
