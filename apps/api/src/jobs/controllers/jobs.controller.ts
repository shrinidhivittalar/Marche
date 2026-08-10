import {
  Body,
  Controller,
  Delete,
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
import { JobsService } from '../services/jobs.service';
import { CreateJobDto, UpdateJobDto } from '../dto/job.dto';
import { SearchJobsDto } from '../dto/search-jobs.dto';
import { AttachFileDto } from '../dto/attach-file.dto';
import { PaginationQueryDto } from '../../profiles/dto/pagination-query.dto';

// "Requirement" in every summary, "job" in every path and type name — the
// product word and the domain word for the same thing, kept separate on
// purpose so neither leaks into the other's territory.
@ApiTags('jobs')
@Controller('jobs')
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  // ---------------------------------------------------------------------
  // Route order is load-bearing. Nest matches in declaration order, so the
  // literal 'me' paths must be declared before ':id' — otherwise a request
  // to /jobs/me is captured by the parameterised route and "me" is treated
  // as a job id. Same trap as the services controller; covered by a test.
  // ---------------------------------------------------------------------

  @Get()
  @ApiOperation({
    summary: 'Browse and search published requirements. Public — no authentication required.',
    description: 'Drafts, cancelled and filled requirements never appear here, whoever is asking.',
  })
  search(@Query() query: SearchJobsDto) {
    return this.jobsService.search(query);
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: "The caller's own requirements, including drafts" })
  @UseGuards(JwtAuthGuard)
  listMine(@CurrentUser() user: AuthenticatedUser, @Query() pagination: PaginationQueryDto) {
    return this.jobsService.listMine(user.id, pagination);
  }

  @Get('me/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'One of your own requirements, in any state' })
  @UseGuards(JwtAuthGuard)
  findMine(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.jobsService.findMineById(user.id, id);
  }

  @Get(':id')
  @ApiOperation({
    summary:
      'A single published requirement. Public. Returns 404 for hidden ones, ' +
      'indistinguishably from ones that do not exist.',
  })
  findOne(@Param('id') id: string) {
    return this.jobsService.findPublicById(id);
  }

  @Post()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a requirement (Client only). Starts as a DRAFT.' })
  @UseGuards(JwtAuthGuard)
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateJobDto) {
    return this.jobsService.create(user.id, dto);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Update your own requirement. Status is not settable here.',
    description:
      'Allowed while the requirement is a draft or published; not once it is filled or cancelled.',
  })
  @UseGuards(JwtAuthGuard)
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateJobDto,
  ) {
    return this.jobsService.update(user.id, id, dto);
  }

  // Lifecycle changes get their own routes rather than being a field on the
  // update DTO, so each has one auditable path. There is no route to FILLED
  // — that transition belongs to accepting a proposal, in Module 5.
  @Post(':id/publish')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Publish your own requirement so providers can find it' })
  @UseGuards(JwtAuthGuard)
  publish(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.jobsService.publish(user.id, id);
  }

  @Post(':id/cancel')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Cancel your own requirement',
    description: 'It stops appearing in discovery and stays visible to you for reference.',
  })
  @UseGuards(JwtAuthGuard)
  cancel(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.jobsService.cancel(user.id, id);
  }

  // Attachments live under the requirement that owns them, so the route
  // carries both ids and neither can be checked in isolation.
  //
  // Reads are authenticated even though the requirement itself is public: a
  // guest can see what a client is asking for, but not download their floor
  // plan. This is why attachments are not folded into GET /jobs/:id.
  @Get(':id/attachments')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Files attached to a requirement, as short-lived signed URLs',
    description:
      'The owner sees their own in any state. Everyone else sees them only while the ' +
      'requirement is published.',
  })
  @UseGuards(JwtAuthGuard)
  listAttachments(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.jobsService.listAttachments(user.id, id);
  }

  @Post(':id/attachments')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Attach an uploaded file to your own requirement',
    description: 'The file must belong to you and have finished uploading.',
  })
  @UseGuards(JwtAuthGuard)
  addAttachment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: AttachFileDto,
  ) {
    return this.jobsService.addAttachment(user.id, id, dto.mediaId);
  }

  @Delete(':id/attachments/:attachmentId')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Detach a file from your own requirement',
    description: 'The file itself is kept — it belongs to you, not to the requirement.',
  })
  @UseGuards(JwtAuthGuard)
  async removeAttachment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
  ) {
    await this.jobsService.removeAttachment(user.id, id, attachmentId);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete your own draft',
    description: 'Drafts only. A published requirement is cancelled instead.',
  })
  @UseGuards(JwtAuthGuard)
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    await this.jobsService.remove(user.id, id);
  }
}
