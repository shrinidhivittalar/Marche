import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../identity/guards/jwt-auth.guard';
import { CurrentUser } from '../../identity/current-user.decorator';
import type { AuthenticatedUser } from '../../identity/strategies/jwt.strategy';
import { SavedProvidersService } from '../services/saved-providers.service';
import { PaginationQueryDto } from '../../profiles/dto/pagination-query.dto';

@ApiTags('saved-providers')
@Controller('saved-providers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
export class SavedProvidersController {
  constructor(private readonly savedProvidersService: SavedProvidersService) {}

  @Get('me')
  @ApiOperation({
    summary: "The caller's saved providers (Client only), newest-saved first",
    description: 'Same card shape provider search results use.',
  })
  listMine(@CurrentUser() user: AuthenticatedUser, @Query() pagination: PaginationQueryDto) {
    return this.savedProvidersService.listMine(user.id, user.role, pagination);
  }
}
