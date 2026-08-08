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
import { ServicesService } from '../services/services.service';
import { CreateServiceDto, ServiceVisibilityDto, UpdateServiceDto } from '../dto/service.dto';
import { SearchServicesDto } from '../dto/search-services.dto';
import { PaginationQueryDto } from '../../profiles/dto/pagination-query.dto';

@ApiTags('services')
@Controller('services')
export class ServicesController {
  constructor(private readonly servicesService: ServicesService) {}

  // ---------------------------------------------------------------------
  // Route order is load-bearing. Nest matches in declaration order, so the
  // literal 'me' path must be declared before ':id' — otherwise a request
  // to /services/me is captured by the parameterised route and "me" is
  // treated as a service id. Covered by a test in tests/routes.spec.ts.
  // ---------------------------------------------------------------------

  @Get()
  @ApiOperation({
    summary: 'Search and browse published services. Public — no authentication required.',
  })
  search(@Query() query: SearchServicesDto) {
    return this.servicesService.search(query);
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: "The caller's own listings, including drafts and unpublished ones" })
  @UseGuards(JwtAuthGuard)
  listMine(@CurrentUser() user: AuthenticatedUser, @Query() pagination: PaginationQueryDto) {
    return this.servicesService.listMine(user.id, pagination);
  }

  @Get(':id')
  @ApiOperation({
    summary:
      'A single published service. Public. Returns 404 for hidden listings, ' +
      'indistinguishably from ones that do not exist.',
  })
  findOne(@Param('id') id: string) {
    return this.servicesService.findPublicById(id);
  }

  @Post()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a service (Provider only). Starts as a DRAFT.' })
  @UseGuards(JwtAuthGuard)
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateServiceDto) {
    return this.servicesService.create(user.id, dto);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update your own service. Status is not settable here.' })
  @UseGuards(JwtAuthGuard)
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateServiceDto,
  ) {
    return this.servicesService.update(user.id, id, dto);
  }

  // Separate from the update route so a visibility change has one auditable
  // path rather than being one field among many in a general edit.
  @Patch(':id/visibility')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Publish or unpublish your own service' })
  @UseGuards(JwtAuthGuard)
  setVisibility(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ServiceVisibilityDto,
  ) {
    return this.servicesService.setVisibility(user.id, id, dto);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft delete your own service' })
  @UseGuards(JwtAuthGuard)
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    await this.servicesService.remove(user.id, id);
  }
}
