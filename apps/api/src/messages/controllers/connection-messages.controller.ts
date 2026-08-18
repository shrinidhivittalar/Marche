import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../identity/guards/jwt-auth.guard';
import { CurrentUser } from '../../identity/current-user.decorator';
import type { AuthenticatedUser } from '../../identity/strategies/jwt.strategy';
import { MessagesService } from '../services/messages.service';
import { SendMessageDto } from '../dto/send-message.dto';
import { PaginationQueryDto } from '../../profiles/dto/pagination-query.dto';

// The path sits under /connections, matching /jobs/:jobId/proposals — a
// message only ever exists in the context of the Connection it belongs to,
// and every route here is authorized through that Connection (see
// MessagesService, which delegates to ConnectionsService.findById).
@ApiTags('messages')
@Controller('connections/:connectionId/messages')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
export class ConnectionMessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Get()
  @ApiOperation({
    summary: 'The message thread for one connection, newest first',
    description: 'Readable by either party to the connection, no one else.',
  })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('connectionId') connectionId: string,
    @Query() pagination: PaginationQueryDto,
  ) {
    return this.messagesService.list(user.id, connectionId, pagination);
  }

  @Post()
  @ApiOperation({ summary: 'Send a message on this connection' })
  send(
    @CurrentUser() user: AuthenticatedUser,
    @Param('connectionId') connectionId: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.messagesService.send(user.id, connectionId, dto.body);
  }

  @Patch('read')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: "Mark the other party's messages on this connection read",
    description: 'Only ever touches messages the caller did not send.',
  })
  async markRead(
    @CurrentUser() user: AuthenticatedUser,
    @Param('connectionId') connectionId: string,
  ): Promise<void> {
    await this.messagesService.markRead(user.id, connectionId);
  }
}
