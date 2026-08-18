import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../identity/guards/jwt-auth.guard';
import { CurrentUser } from '../../identity/current-user.decorator';
import type { AuthenticatedUser } from '../../identity/strategies/jwt.strategy';
import { MessagesService } from '../services/messages.service';

// The caller's view across every connection at once — what the Messages
// page's conversation list needs, as opposed to ConnectionMessagesController
// which is scoped to one thread. Both are "mine" in the same sense
// ConnectionsController's GET /connections/me is: read-only, own data only.
@ApiTags('messages')
@Controller('messages')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Get('previews')
  @ApiOperation({
    summary: 'One preview per connection the caller is party to: last message and unread count',
    description:
      'What the conversation list renders, in one request instead of one per connection.',
  })
  previews(@CurrentUser() user: AuthenticatedUser) {
    return this.messagesService.previews(user.id);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'How many unread messages the caller has, across every connection' })
  unreadCount(@CurrentUser() user: AuthenticatedUser) {
    return this.messagesService.unreadCount(user.id);
  }
}
