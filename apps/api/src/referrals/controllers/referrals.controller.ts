import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../identity/guards/jwt-auth.guard';
import { CurrentUser } from '../../identity/current-user.decorator';
import type { AuthenticatedUser } from '../../identity/strategies/jwt.strategy';
import { ReferralsService } from '../services/referrals.service';
import { CreateReferralDto } from '../dto/create-referral.dto';
import { PaginationQueryDto } from '../../profiles/dto/pagination-query.dto';

@ApiTags('referrals')
@Controller('referrals')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
export class ReferralsController {
  constructor(private readonly referralsService: ReferralsService) {}

  @Get('me')
  @ApiOperation({
    summary: "The caller's referral history (Client only), newest first",
  })
  listMine(@CurrentUser() user: AuthenticatedUser, @Query() pagination: PaginationQueryDto) {
    return this.referralsService.listMine(user.id, user, pagination);
  }

  @Post()
  @ApiOperation({
    summary: 'Refer someone by email (Client only)',
    description:
      'Sends a real invite email. The referral is marked JOINED on its own once someone ' +
      'registers with this exact email address — see AuthService.register.',
  })
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateReferralDto) {
    return this.referralsService.create(user.id, user, dto);
  }
}
