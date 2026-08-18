import { Body, Controller, Get, Post, UseGuards, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../identity/guards/jwt-auth.guard';
import { CurrentUser } from '../../identity/current-user.decorator';
import type { AuthenticatedUser } from '../../identity/strategies/jwt.strategy';
import { DisputesService } from '../services/disputes.service';
import { CreateDisputeDto } from '../dto/create-dispute.dto';

// The path sits under /connections, matching /connections/:id/reviews and
// /connections/:id/messages — a dispute only ever exists in the context of
// the connection it's about.
@ApiTags('disputes')
@Controller('connections/:connectionId/disputes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
export class ConnectionDisputesController {
  constructor(private readonly disputesService: DisputesService) {}

  @Get()
  @ApiOperation({ summary: 'Disputes on this connection (either party, or Admin)' })
  list(@CurrentUser() user: AuthenticatedUser, @Param('connectionId') connectionId: string) {
    return this.disputesService.listForConnection(user.id, user.role, connectionId);
  }

  @Post()
  @ApiOperation({
    summary: 'Raise a dispute against the other party on this connection',
    description: 'Only one non-resolved dispute may be active on a connection at a time.',
  })
  raise(
    @CurrentUser() user: AuthenticatedUser,
    @Param('connectionId') connectionId: string,
    @Body() dto: CreateDisputeDto,
  ) {
    return this.disputesService.raise(user.id, connectionId, dto.reason, dto.evidence);
  }
}
