import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ReviewsService } from '../services/reviews.service';
import { PaginationQueryDto } from '../../profiles/dto/pagination-query.dto';

// Public, unlike ConnectionReviewsController — the whole point of a review
// is that anyone deciding whether to hire this profile can read it, the
// same way PublicProfilePage itself needs no auth.
@ApiTags('reviews')
@Controller('profiles/:profileId/reviews')
export class ProfileReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Get()
  @ApiOperation({
    summary: "A profile's visible reviews, newest first",
    description:
      'A review not yet visible to the public (see ReviewsService) is simply absent here.',
  })
  list(@Param('profileId') profileId: string, @Query() pagination: PaginationQueryDto) {
    return this.reviewsService.listForProfile(profileId, pagination);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Average rating and count over this profile’s visible reviews' })
  stats(@Param('profileId') profileId: string) {
    return this.reviewsService.statsForProfile(profileId);
  }
}
