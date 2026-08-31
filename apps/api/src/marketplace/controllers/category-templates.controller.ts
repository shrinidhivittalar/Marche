import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../identity/guards/jwt-auth.guard';
import { PlatformRoleGuard } from '../../identity/guards/platform-role.guard';
import { RequirePlatformRole } from '../../identity/decorators/require-platform-role.decorator';
import { CurrentUser } from '../../identity/current-user.decorator';
import type { AuthenticatedUser } from '../../identity/strategies/jwt.strategy';
import { CategoryTemplatesService } from '../services/category-templates.service';
import { CreateCategoryTemplateDto } from '../dto/category-template.dto';

// Deliberately its own controller rather than folded into
// CategoriesController — template management is substantial enough to
// warrant the same separation ProfilesController/PortfolioController
// already use for one entity's sub-resources. Registered on the same
// /categories path; route patterns never collide with
// CategoriesController's own routes because segment counts differ
// (:slug vs :slug/template, etc.), so declaration order between the two
// controllers does not matter here.
@ApiTags('categories')
@Controller('categories')
export class CategoryTemplatesController {
  constructor(private readonly categoryTemplatesService: CategoryTemplatesService) {}

  @Get(':slug/template')
  @ApiOperation({
    summary: "A category's active requirement-form template. No authentication.",
    description:
      '{ template: null } for a category with nothing configured yet — a normal, expected ' +
      'state, not an error.',
  })
  getActive(@Param('slug') slug: string) {
    return this.categoryTemplatesService.getActiveForSlug(slug);
  }

  // The public counterpart to a Job's locked categoryTemplateId: a Job may
  // be pinned to a version other than whatever this category's active one
  // is right now, and this is how anyone who can see that Job (including
  // an anonymous provider browsing it) reads the exact version its
  // categoryData was validated against. No admin gate — same visibility as
  // getActive, just for a specific historical version instead of "current".
  @Get(':slug/template/:templateId')
  @ApiOperation({
    summary: 'One specific template version, by id. No authentication.',
    description:
      'For rendering an existing Job’s categoryData correctly — its locked version may not ' +
      'be the category’s current active one.',
  })
  getVersionPublic(@Param('slug') slug: string, @Param('templateId') templateId: string) {
    return this.categoryTemplatesService.getVersionForSlug(slug, templateId);
  }

  // Primary enforcement is PlatformRoleGuard; CategoryTemplatesService's own
  // assertAdminRole call is kept as a defensive backstop — the same current
  // pattern CategoriesController uses, not the stale service-only
  // description module3.md still records.
  @Get(':id/templates')
  @ApiBearerAuth()
  @ApiOperation({ summary: "A category's full template version history (Administrator only)" })
  @UseGuards(JwtAuthGuard, PlatformRoleGuard)
  @RequirePlatformRole('ADMIN')
  listVersions(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.categoryTemplatesService.listVersions(user.platformRole, id);
  }

  @Get(':id/templates/:templateId')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'One immutable template version (Administrator only)' })
  @UseGuards(JwtAuthGuard, PlatformRoleGuard)
  @RequirePlatformRole('ADMIN')
  getVersion(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('templateId') templateId: string,
  ) {
    return this.categoryTemplatesService.getVersion(user.platformRole, id, templateId);
  }

  @Post(':id/templates')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Create a new template version and activate it (Administrator only)',
    description:
      'Creating a version activates it — there is no draft state and no separate publish ' +
      'step. The previous active version, if any, is left exactly as it was.',
  })
  @UseGuards(JwtAuthGuard, PlatformRoleGuard)
  @RequirePlatformRole('ADMIN')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CreateCategoryTemplateDto,
  ) {
    return this.categoryTemplatesService.createAndActivate(user.platformRole, user.id, id, dto);
  }
}
