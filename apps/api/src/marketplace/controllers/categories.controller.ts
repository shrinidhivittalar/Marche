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
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../identity/guards/jwt-auth.guard';
import { PlatformRoleGuard } from '../../identity/guards/platform-role.guard';
import { RequirePlatformRole } from '../../identity/decorators/require-platform-role.decorator';
import { CurrentUser } from '../../identity/current-user.decorator';
import type { AuthenticatedUser } from '../../identity/strategies/jwt.strategy';
import { CategoriesService } from '../services/categories.service';
import { CreateCategoryDto, UpdateCategoryDto } from '../dto/category.dto';

@ApiTags('categories')
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  @ApiOperation({ summary: 'Category tree — parents with their children. No authentication.' })
  getTree() {
    return this.categoriesService.getTree();
  }

  @Get(':slug')
  @ApiOperation({ summary: 'A single category by slug, with its children' })
  getBySlug(@Param('slug') slug: string) {
    return this.categoriesService.getBySlug(slug);
  }

  // Primary enforcement is PlatformRoleGuard below (Module 01 Slice 2).
  // CategoriesService's own assertAdminRole call is kept as a defensive
  // backstop, not removed — see the comment on AuditController for the
  // same pattern.
  @Post()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a category (Administrator only)' })
  @UseGuards(JwtAuthGuard, PlatformRoleGuard)
  @RequirePlatformRole('ADMIN')
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateCategoryDto) {
    return this.categoriesService.create(user.platformRole, dto);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a category (Administrator only)' })
  @UseGuards(JwtAuthGuard, PlatformRoleGuard)
  @RequirePlatformRole('ADMIN')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.categoriesService.update(user.platformRole, id, dto);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary:
      'Soft delete a category (Administrator only). 409 if it still has children or services.',
  })
  @UseGuards(JwtAuthGuard, PlatformRoleGuard)
  @RequirePlatformRole('ADMIN')
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    await this.categoriesService.remove(user.platformRole, id);
  }
}
