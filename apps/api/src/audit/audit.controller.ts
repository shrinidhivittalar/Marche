import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../identity/guards/jwt-auth.guard';
import { CurrentUser } from '../identity/current-user.decorator';
import type { AuthenticatedUser } from '../identity/strategies/jwt.strategy';
import { AuditService } from './audit.service';
import { AuditLogQueryDto } from './dto/audit-log-query.dto';

// Admin-only, enforced in AuditService.list rather than a route-level
// guard — same pattern as CategoriesService's assertAdminRole, so the check
// travels with the query it protects instead of living beside it.
@ApiTags('audit')
@Controller('audit-logs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @ApiOperation({
    summary: 'The security audit trail (Admin only)',
    description: 'Auth events only — see AuditService.record. Newest first.',
  })
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: AuditLogQueryDto) {
    return this.auditService.list(user.role, query);
  }
}
