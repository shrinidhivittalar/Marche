import { Body, Controller, Post, UseGuards, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../identity/guards/jwt-auth.guard';
import { CurrentUser } from '../../identity/current-user.decorator';
import type { AuthenticatedUser } from '../../identity/strategies/jwt.strategy';
import { ReviewsService } from '../services/reviews.service';
import { CreateReviewDto } from '../dto/create-review.dto';

// The path sits under /connections, matching /connections/:id/messages — a
// review only ever exists in the context of the Connection it was written
// about. No GET here: a single review isn't fetched on its own, only ever as
// part of a profile's public list (see profile-reviews.controller.ts).
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
}
