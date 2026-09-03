import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { PlatformRoleGuard } from '../guards/platform-role.guard';
import { RequirePlatformRole } from '../decorators/require-platform-role.decorator';
import { CurrentUser } from '../current-user.decorator';
import { AdminService } from '../services/admin.service';
import { UpdatePlatformRoleDto } from '../dto/update-platform-role.dto';
import { UpdateUserStatusDto } from '../dto/update-user-status.dto';
import { UserListQueryDto } from '../dto/user-list-query.dto';
import type { AuthenticatedUser } from '../strategies/jwt.strategy';

// Super Admin only. module1-implementation-contract.md §5: this is the one
// endpoint that can change platformRole after the one-time bootstrap script
// — never self-service, and an ADMIN calling this gets rejected by
// PlatformRoleGuard before AdminService ever runs.
@ApiTags('admin')
@Controller('admin/users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PlatformRoleGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // ADMIN, same bar as :id/status — this is the "identify a problematic
  // user" half of the same gap, not a higher-stakes action than suspending
  // one.
  @Get()
  @RequirePlatformRole('ADMIN')
  @ApiOperation({ summary: 'Browse/search users (Admin only)' })
  listUsers(@Query() query: UserListQueryDto) {
    return this.adminService.listUsers(query);
  }

  @Patch(':id/platform-role')
  @RequirePlatformRole('SUPER_ADMIN')
  @ApiOperation({ summary: 'Grant or change a user’s platform role (Super Admin only)' })
  updatePlatformRole(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdatePlatformRoleDto,
  ) {
    return this.adminService.changePlatformRole(user.id, id, dto.platformRole);
  }

  // ADMIN, not SUPER_ADMIN — suspending a bad actor is a lower-stakes,
  // more frequent action than changing platform authority, and shouldn't
  // require the smaller Super Admin group to be the only ones who can act.
  @Patch(':id/status')
  @RequirePlatformRole('ADMIN')
  @ApiOperation({ summary: 'Suspend or restore a user account (Admin only)' })
  updateStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateUserStatusDto,
  ) {
    return this.adminService.setUserStatus(user.id, id, dto.status);
  }
}
