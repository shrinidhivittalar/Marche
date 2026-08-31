import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../identity/guards/jwt-auth.guard';
import { CurrentUser } from '../../identity/current-user.decorator';
import type { AuthenticatedUser } from '../../identity/strategies/jwt.strategy';
import { PriceNegotiationsService } from '../services/price-negotiations.service';
import { ProposePriceDto } from '../dto/propose-price.dto';

// Negotiated commercial terms on one proposal. Lives under /proposals/:id
// rather than its own top-level path, the same reasoning JobProposalsController
// carries its jobId — a negotiation round means nothing without the proposal
// it belongs to, and this keeps ownership resolution to one lookup instead of
// two ids that could be paired inconsistently.
@ApiTags('proposals')
@Controller('proposals/:id/price-negotiations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
export class PriceNegotiationsController {
  constructor(private readonly priceNegotiationsService: PriceNegotiationsService) {}

  @Get()
  @ApiOperation({
    summary: 'The full price-negotiation history on a proposal (either party)',
    description:
      'Every round ever proposed, oldest first — the audit trail. Not just the latest amount.',
  })
  list(@CurrentUser() user: AuthenticatedUser, @Param('id') proposalId: string) {
    return this.priceNegotiationsService.list(user.id, proposalId);
  }

  @Post()
  @ApiOperation({
    summary: 'Propose a new price on this proposal (either party)',
    description:
      'The client who owns the requirement or the provider who owns the proposal may propose. ' +
      'Fails with 409 if a round is already pending — resolve it first.',
  })
  propose(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') proposalId: string,
    @Body() dto: ProposePriceDto,
  ) {
    return this.priceNegotiationsService.propose(user.id, proposalId, dto.amount);
  }

  @Post(':negotiationId/accept')
  @ApiOperation({
    summary: 'Accept a pending price round (the party who did not propose it)',
    description: 'Sets this proposal’s agreed price. The proposer cannot accept their own round.',
  })
  accept(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') proposalId: string,
    @Param('negotiationId') negotiationId: string,
  ) {
    return this.priceNegotiationsService.accept(user.id, proposalId, negotiationId);
  }

  @Post(':negotiationId/reject')
  @ApiOperation({
    summary: 'Reject a pending price round (the party who did not propose it)',
    description: 'The proposal keeps its current agreed/proposed price. Rejecting is always valid.',
  })
  reject(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') proposalId: string,
    @Param('negotiationId') negotiationId: string,
  ) {
    return this.priceNegotiationsService.reject(user.id, proposalId, negotiationId);
  }

  @Post(':negotiationId/withdraw')
  @ApiOperation({
    summary: 'Withdraw your own pending price round',
    description: 'Only the party who proposed this round may withdraw it.',
  })
  withdraw(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') proposalId: string,
    @Param('negotiationId') negotiationId: string,
  ) {
    return this.priceNegotiationsService.withdraw(user.id, proposalId, negotiationId);
  }
}
