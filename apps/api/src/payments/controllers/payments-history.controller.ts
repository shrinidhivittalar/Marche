import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../identity/guards/jwt-auth.guard';
import { CurrentUser } from '../../identity/current-user.decorator';
import type { AuthenticatedUser } from '../../identity/strategies/jwt.strategy';
import { PaymentsService } from '../services/payments.service';
import { PaginationQueryDto } from '../../profiles/dto/pagination-query.dto';

// Separate from PaymentsController: that one is scoped to a single
// connection (/connections/:id/payment), and "every payment I've ever made
// or received" isn't a resource under any one connection — same reasoning
// as ConnectionsController's own /connections/me.
@ApiTags('payments')
@Controller('payments/me')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
export class PaymentsHistoryController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get()
  @ApiOperation({
    summary: "The caller's own payment history",
    description:
      'A client sees what they have paid; a provider sees what they have been paid — the ' +
      'same list of Payment rows, read from whichever side the profile is on.',
  })
  listMine(@CurrentUser() user: AuthenticatedUser, @Query() pagination: PaginationQueryDto) {
    return this.paymentsService.listMine(user.id, pagination);
  }
}
