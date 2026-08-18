import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { JobsService } from '../services/jobs.service';

// The path sits under /profiles, matching /profiles/:profileId/save's own
// "nested under the thing it's about" style. Public, like a job listing
// itself — a provider deciding whether to bid needs this before signing in
// is even relevant.
@ApiTags('jobs')
@Controller('profiles/:profileId/client-stats')
export class ClientJobStatsController {
  constructor(private readonly jobsService: JobsService) {}

  @Get()
  @ApiOperation({
    summary: "A client's hiring stats — jobs posted, open jobs, hire rate, member since",
    description: 'Public. No spend or hourly-rate figures: this app has no payment integration.',
  })
  clientStats(@Param('profileId') profileId: string) {
    return this.jobsService.clientStats(profileId);
  }
}
