import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../identity/guards/jwt-auth.guard';
import { CurrentUser } from '../../identity/current-user.decorator';
import type { AuthenticatedUser } from '../../identity/strategies/jwt.strategy';
import { WorkDiaryService } from '../services/work-diary.service';
import { PaginationQueryDto } from '../../profiles/dto/pagination-query.dto';

// Separate from ConnectionWorkDiaryController for the same reason
// PaymentsHistoryController is separate from PaymentsController: "every
// entry I've ever written or received across every connection" isn't a
// resource under any one connection.
@ApiTags('work-diary')
@Controller('work-diary/me')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
export class WorkDiaryHistoryController {
  constructor(private readonly workDiaryService: WorkDiaryService) {}

  @Get()
  @ApiOperation({ summary: "Every work diary entry across the caller's own connections" })
  listMine(@CurrentUser() user: AuthenticatedUser, @Query() pagination: PaginationQueryDto) {
    return this.workDiaryService.listMine(user.id, pagination);
  }
}
