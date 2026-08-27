import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../identity/guards/jwt-auth.guard';
import { PlatformRoleGuard } from '../../identity/guards/platform-role.guard';
import { RequirePlatformRole } from '../../identity/decorators/require-platform-role.decorator';
import { CurrentUser } from '../../identity/current-user.decorator';
import type { AuthenticatedUser } from '../../identity/strategies/jwt.strategy';
import { DisputesService } from '../services/disputes.service';
import { DisputeListQueryDto } from '../dto/dispute-list-query.dto';
import { ResolveDisputeDto } from '../dto/resolve-dispute.dto';

// Both routes below are admin-only. Primary enforcement is PlatformRoleGuard
// (Module 01 Slice 2) — DisputesService's own assertAdminRole calls are
// kept as a defensive backstop, not removed, same pattern as
// AuditController/CategoriesController.
@ApiTags('disputes')
@Controller('disputes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
export class DisputesController {
  constructor(private readonly disputesService: DisputesService) {}

  @Get()
  @UseGuards(PlatformRoleGuard)
  @RequirePlatformRole('ADMIN')
  @ApiOperation({
    summary: 'Every dispute (Admin only), oldest first, optionally filtered by status',
  })
  listAll(@CurrentUser() user: AuthenticatedUser, @Query() query: DisputeListQueryDto) {
    return this.disputesService.listAll(user.platformRole, query);
  }

  @Patch(':id/resolve')
  @UseGuards(PlatformRoleGuard)
  @RequirePlatformRole('ADMIN')
  @ApiOperation({
    summary: 'Resolve a dispute (Admin only, idempotent)',
    description: 'Resolving an already-resolved dispute just returns it unchanged.',
  })
  resolve(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ResolveDisputeDto,
  ) {
    return this.disputesService.resolve(user.platformRole, id, user.id, dto.resolution);
  }
}
