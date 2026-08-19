import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../identity/guards/jwt-auth.guard';
import { CurrentUser } from '../../identity/current-user.decorator';
import type { AuthenticatedUser } from '../../identity/strategies/jwt.strategy';
import { DirectContractsService } from '../services/direct-contracts.service';
import { CreateDirectContractDto } from '../dto/create-direct-contract.dto';

@ApiTags('direct-contracts')
@Controller('direct-contracts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
export class DirectContractsController {
  constructor(private readonly directContractsService: DirectContractsService) {}

  @Post()
  @ApiOperation({
    summary:
      'Offer a specific provider a direct hire, skipping the public job posting (Client only)',
    description:
      'Creates a private job and a proposal on it, targeted at the named provider. Nothing is ' +
      'binding yet — the offer sits as a pending proposal until that provider accepts or ' +
      'declines it via the two routes below.',
  })
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateDirectContractDto) {
    return this.directContractsService.create(user.id, dto);
  }

  @Post(':id/accept')
  @ApiOperation({
    summary: 'Accept a direct contract offer (the named provider only)',
    description:
      'Fills the job and establishes the connection — Payments, Reviews, Disputes and Work ' +
      'Diary all then work on it exactly like a marketplace hire.',
  })
  accept(@CurrentUser() user: AuthenticatedUser, @Param('id') proposalId: string) {
    return this.directContractsService.accept(user.id, proposalId);
  }

  @Post(':id/decline')
  @ApiOperation({ summary: 'Decline a direct contract offer (the named provider only)' })
  decline(@CurrentUser() user: AuthenticatedUser, @Param('id') proposalId: string) {
    return this.directContractsService.decline(user.id, proposalId);
  }
}
