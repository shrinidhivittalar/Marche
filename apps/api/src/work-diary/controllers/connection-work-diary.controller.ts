import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../identity/guards/jwt-auth.guard';
import { CurrentUser } from '../../identity/current-user.decorator';
import type { AuthenticatedUser } from '../../identity/strategies/jwt.strategy';
import { WorkDiaryService } from '../services/work-diary.service';
import { CreateWorkDiaryEntryDto } from '../dto/create-work-diary-entry.dto';

// The path sits under /connections, matching /connections/:id/disputes — an
// entry only ever exists in the context of the connection it logs.
@ApiTags('work-diary')
@Controller('connections/:connectionId/work-diary')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
export class ConnectionWorkDiaryController {
  constructor(private readonly workDiaryService: WorkDiaryService) {}

  @Get()
  @ApiOperation({ summary: 'The work diary for this connection, oldest first' })
  list(@CurrentUser() user: AuthenticatedUser, @Param('connectionId') connectionId: string) {
    return this.workDiaryService.listForConnection(user.id, connectionId);
  }

  @Post()
  @ApiOperation({ summary: 'Post a dated update on this connection (either party)' })
  addEntry(
    @CurrentUser() user: AuthenticatedUser,
    @Param('connectionId') connectionId: string,
    @Body() dto: CreateWorkDiaryEntryDto,
  ) {
    return this.workDiaryService.addEntry(user.id, connectionId, dto.note);
  }
}
