import { Body, Controller, Get, Post, UseGuards, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../identity/guards/jwt-auth.guard';
import { CurrentUser } from '../../identity/current-user.decorator';
import type { AuthenticatedUser } from '../../identity/strategies/jwt.strategy';
import { ReviewsService } from '../services/reviews.service';
import { CreateReviewDto } from '../dto/create-review.dto';

// The path sits under /connections, matching /connections/:id/messages — a
// review only ever exists in the context of the Connection it was written
// about. No GET for a single review by id — only ever read as part of a
// profile's public list (profile-reviews.controller.ts) or, here, "did I
// review this one yet" for the caller's own connection detail screen.
@ApiTags('reviews')
@Controller('connections/:connectionId/reviews')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
export class ConnectionReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Post()
  @ApiOperation({
    summary: 'Review the other party on this connection (either party, once, after COMPLETED)',
    description: 'Stays hidden until the other party also reviews, or 14 days pass.',
  })
  submit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('connectionId') connectionId: string,
    @Body() dto: CreateReviewDto,
  ) {
    return this.reviewsService.submit(user.id, connectionId, dto.rating, dto.comment);
  }

  @Get('me')
  @ApiOperation({
    summary: 'The caller’s own review on this connection, if they have written one',
    description:
      'Null rather than a list — there is at most one, enforced by a unique constraint. ' +
      'Lets a screen show "you already reviewed this" without guessing from a 409.',
  })
  myReview(@CurrentUser() user: AuthenticatedUser, @Param('connectionId') connectionId: string) {
    return this.reviewsService.myReview(user.id, connectionId);
  }
}
