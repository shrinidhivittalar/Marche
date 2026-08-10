import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../identity/guards/jwt-auth.guard';
import { CurrentUser } from '../../identity/current-user.decorator';
import type { AuthenticatedUser } from '../../identity/strategies/jwt.strategy';
import { ProposalsService } from '../services/proposals.service';
import { PaginationQueryDto } from '../../profiles/dto/pagination-query.dto';

/**
 * The client's review surface: the proposals on one of their requirements.
 *
 * The path sits under /jobs, but the controller lives in the Proposals
 * module — deliberately. Jobs must not learn that Proposals exist: the
 * dependency runs one way, Proposals reading Jobs and never the reverse.
 * Declaring these two routes on JobsController would reverse that for the
 * sake of matching a URL to a folder.
 *
 * Read-only. Deciding on a proposal happens on the proposal's own routes, so
 * there is one path to each decision rather than two.
 */
@ApiTags('proposals')
@Controller('jobs/:jobId/proposals')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
export class JobProposalsController {
  constructor(private readonly proposalsService: ProposalsService) {}

  @Get()
  @ApiOperation({
    summary: 'Proposals on your own requirement (Client only)',
    description:
      'Withdrawn proposals are included, marked as such: one the client has already read ' +
      'must not vanish mid-review.',
  })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('jobId') jobId: string,
    @Query() pagination: PaginationQueryDto,
  ) {
    return this.proposalsService.listForJob(user.id, jobId, pagination);
  }

  @Get(':proposalId')
  @ApiOperation({
    summary: 'One proposal on your own requirement',
    description:
      'Both ids are checked, not just ownership of the requirement — otherwise any ' +
      'proposal could be read by pairing it with a requirement the caller happens to own.',
  })
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('jobId') jobId: string,
    @Param('proposalId') proposalId: string,
  ) {
    return this.proposalsService.findForJob(user.id, jobId, proposalId);
  }
}
