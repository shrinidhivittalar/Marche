import { Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../identity/guards/jwt-auth.guard';
import { CurrentUser } from '../../identity/current-user.decorator';
import type { AuthenticatedUser } from '../../identity/strategies/jwt.strategy';
import { ConnectionsService } from '../services/connections.service';
import { PaginationQueryDto } from '../../profiles/dto/pagination-query.dto';

/**
 * Reads, plus one lifecycle write.
 *
 * There is no POST. A connection is created inside the proposal-acceptance
 * transaction and nowhere else, so nobody — client or provider — can
 * manufacture a hiring relationship that no proposal produced. There is no
 * DELETE: a connection, once it exists, exists permanently. The one PATCH
 * that does exist moves status from ACTIVE to COMPLETED and nothing else —
 * see ConnectionsService.confirmComplete.
 */
@ApiTags('connections')
@Controller('connections')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
export class ConnectionsController {
  constructor(private readonly connectionsService: ConnectionsService) {}

  // 'me' before ':id', for the same reason as everywhere else: Nest matches
  // in declaration order, and a literal path declared second is unreachable.
  @Get('me')
  @ApiOperation({
    summary: "The caller's own connections, from whichever side they are on",
    description:
      "One list for both roles — a client's connections and a provider's are the same " +
      'rows read from opposite ends.',
  })
  listMine(@CurrentUser() user: AuthenticatedUser, @Query() pagination: PaginationQueryDto) {
    return this.connectionsService.listMine(user.id, pagination);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One connection, readable by either party to it' })
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.connectionsService.findById(user.id, id);
  }

  @Patch(':id/complete')
  @ApiOperation({
    summary: 'The client confirms the connection complete (Client only, after the event date)',
    description:
      'Idempotent — confirming an already-completed connection just returns it unchanged. ' +
      'A connection whose event happened long enough ago completes on its own; this is what ' +
      'lets the client do it sooner.',
  })
  confirmComplete(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.connectionsService.confirmComplete(user.id, id);
  }
}
