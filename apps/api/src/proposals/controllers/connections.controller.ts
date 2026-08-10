import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../identity/guards/jwt-auth.guard';
import { CurrentUser } from '../../identity/current-user.decorator';
import type { AuthenticatedUser } from '../../identity/strategies/jwt.strategy';
import { ConnectionsService } from '../services/connections.service';
import { PaginationQueryDto } from '../../profiles/dto/pagination-query.dto';

/**
 * Reads only, and that is the design.
 *
 * There is no POST. A connection is created inside the proposal-acceptance
 * transaction and nowhere else, so nobody — client or provider — can
 * manufacture a hiring relationship that no proposal produced. There is no
 * PATCH or DELETE either: Phase 1 has one state, and the row existing is
 * what it means.
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
}
