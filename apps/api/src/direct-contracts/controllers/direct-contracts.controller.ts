import { Body, Controller, Post, UseGuards } from '@nestjs/common';
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
    summary: 'Hire a specific provider directly, skipping the public job posting (Client only)',
    description:
      'Creates a private job, an already-accepted proposal, and the resulting connection in ' +
      'one step. The job is never published or discoverable — Payments, Reviews, Disputes and ' +
      'Work Diary all work on the connection exactly like a marketplace hire.',
  })
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateDirectContractDto) {
    return this.directContractsService.create(user.id, dto);
  }
}
