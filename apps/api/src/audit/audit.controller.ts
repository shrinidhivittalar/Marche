import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../identity/guards/jwt-auth.guard';
import { PlatformRoleGuard } from '../identity/guards/platform-role.guard';
import { RequirePlatformRole } from '../identity/decorators/require-platform-role.decorator';
import { CurrentUser } from '../identity/current-user.decorator';
import type { AuthenticatedUser } from '../identity/strategies/jwt.strategy';
import { AuditService } from './audit.service';
import { AuditLogQueryDto } from './dto/audit-log-query.dto';

// Admin-only. Primary enforcement is the route-level PlatformRoleGuard
// below (Module 01 Slice 2) — AuditService.list's own inline role check is
// kept as a defensive backstop, not removed, the same layered-defense
// relationship the self-dealing checks elsewhere in this slice have to
// their own DB-level backstops.
@ApiTags('audit')
@Controller('audit-logs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PlatformRoleGuard)
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @RequirePlatformRole('ADMIN')
  @ApiOperation({
    summary: 'The security audit trail (Admin only)',
    description: 'Auth events only — see AuditService.record. Newest first.',
  })
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: AuditLogQueryDto) {
    return this.auditService.list(user.role, query);
  }
}
