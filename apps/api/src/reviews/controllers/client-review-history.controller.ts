import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ReviewsService } from '../services/reviews.service';
import { ClientHistoryQueryDto } from '../dto/client-history-query.dto';

// A different question from ProfileReviewsController's: not "what has been
// said about this profile" but "what has this profile, as a client, said
// about the people it has hired" — the same distinction PublicProfilePage
// draws for a provider's received reviews vs. what a client shows a
// prospective provider deciding whether to bid. Public, same reasoning.
@ApiTags('reviews')
@Controller('profiles/:profileId/client-history')
export class ClientReviewHistoryController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Get()
  @ApiOperation({
    summary: "A client's recent reviews of past hires, newest first, visible ones only",
    description:
      'A review not yet visible to the public (see ReviewsService) is simply absent here — ' +
      'showing it early would leak it to its subject before they can see or reciprocate it.',
  })
  clientHistory(@Param('profileId') profileId: string, @Query() query: ClientHistoryQueryDto) {
    return this.reviewsService.clientHistory(profileId, query.limit);
  }
}
