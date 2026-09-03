import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ProfilesModule } from '../profiles/profiles.module';
import { ProposalsModule } from '../proposals/proposals.module';
import { ConnectionMessagesController } from './controllers/connection-messages.controller';
import { MessagesController } from './controllers/messages.controller';
import { MessagesRepository } from './repositories/messages.repository';
import { MessagesService } from './services/messages.service';
import { MessagesGateway } from './gateways/messages.gateway';
import { UsersRepository } from '../identity/repositories/users.repository';

// Depends on ProposalsModule for ConnectionsService/ConnectionsRepository —
// a message only exists on a Connection, and that module already owns "is
// this user a party to this connection". Messages doesn't re-derive that
// check, only reuses it.
//
// JwtModule is registered locally, same as IdentityModule does for the
// same reason (not exported from there) — MessagesGateway needs to verify
// the token itself, since WS handshakes don't go through JwtAuthGuard.
// UsersRepository is provided directly rather than importing IdentityModule
// wholesale: it depends only on PrismaService (global), so a second
// instance here is harmless and avoids pulling in Identity's controllers.
@Module({
  imports: [
    ProfilesModule,
    ProposalsModule,
    JwtModule.register({ secret: process.env.JWT_ACCESS_SECRET }),
  ],
  controllers: [ConnectionMessagesController, MessagesController],
  providers: [MessagesRepository, MessagesService, MessagesGateway, UsersRepository],
})
export class MessagesModule {}
