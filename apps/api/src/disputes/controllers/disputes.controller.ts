import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../identity/guards/jwt-auth.guard';
import { CurrentUser } from '../../identity/current-user.decorator';
import type { AuthenticatedUser } from '../../identity/strategies/jwt.strategy';
import { DisputesService } from '../services/disputes.service';
import { DisputeListQueryDto } from '../dto/dispute-list-query.dto';
import { ResolveDisputeDto } from '../dto/resolve-dispute.dto';

// Admin-only, enforced in DisputesService (assertAdminRole) rather than a
// route-level guard — same convention as CategoriesService.
@ApiTags('disputes')
@Controller('disputes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
export class DisputesController {
  constructor(private readonly disputesService: DisputesService) {}

  @Get()
  @ApiOperation({
    summary: 'Every dispute (Admin only), oldest first, optionally filtered by status',
  })
  listAll(@CurrentUser() user: AuthenticatedUser, @Query() query: DisputeListQueryDto) {
    return this.disputesService.listAll(user.role, query);
  }

  @Patch(':id/resolve')
  @ApiOperation({
    summary: 'Resolve a dispute (Admin only, idempotent)',
    description: 'Resolving an already-resolved dispute just returns it unchanged.',
  })
  resolve(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ResolveDisputeDto,
  ) {
    return this.disputesService.resolve(user.role, id, user.id, dto.resolution);
  }
}
