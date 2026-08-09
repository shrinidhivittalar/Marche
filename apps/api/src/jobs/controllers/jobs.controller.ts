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
