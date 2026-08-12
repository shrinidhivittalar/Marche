import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../identity/guards/jwt-auth.guard';
import { CurrentUser } from '../../identity/current-user.decorator';
import type { AuthenticatedUser } from '../../identity/strategies/jwt.strategy';
import { NotificationsService } from '../services/notifications.service';
import { PaginationQueryDto } from '../../profiles/dto/pagination-query.dto';

// Every route is authenticated and scoped to the caller. There is no public
// notification-creation endpoint here, and none should ever be added —
// notifications are generated internally by the modules that own the events
// (see NotificationsService), never by direct client request.
@ApiTags('notifications')
@Controller('notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @ApiOperation({
    summary: "The caller's own notifications, newest first",
    description: 'Paginated. Never includes another user’s notifications.',
  })
  list(@CurrentUser() user: AuthenticatedUser, @Query() pagination: PaginationQueryDto) {
    return this.notificationsService.list(user.id, pagination);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'How many of the caller’s notifications are unread' })
  unreadCount(@CurrentUser() user: AuthenticatedUser) {
    return this.notificationsService.unreadCount(user.id);
  }

  @Patch(':id/read')
  @ApiOperation({
    summary: 'Mark one of the caller’s own notifications read',
    description:
      'Idempotent — marking an already-read notification again just returns it unchanged.',
  })
  markAsRead(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.notificationsService.markAsRead(user.id, id);
  }

  @Patch('read-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Mark all of the caller’s own notifications read',
    description: 'Only ever touches the authenticated user’s own notifications.',
  })
  async markAllRead(@CurrentUser() user: AuthenticatedUser): Promise<void> {
    await this.notificationsService.markAllRead(user.id);
  }
}
