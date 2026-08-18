import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../identity/guards/jwt-auth.guard';
import { CurrentUser } from '../../identity/current-user.decorator';
import type { AuthenticatedUser } from '../../identity/strategies/jwt.strategy';
import { SavedProvidersService } from '../services/saved-providers.service';

// The path sits under /profiles, matching /connections/:id/reviews's own
// "nested under the thing it's about" style — a save only ever exists in
// the context of the profile being saved.
@ApiTags('saved-providers')
@Controller('profiles/:profileId/save')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
export class ProfileSaveController {
  constructor(private readonly savedProvidersService: SavedProvidersService) {}

  @Get()
  @ApiOperation({ summary: 'Whether the caller has saved this provider profile' })
  isSaved(@CurrentUser() user: AuthenticatedUser, @Param('profileId') profileId: string) {
    return this.savedProvidersService
      .isSaved(user.id, user.role, profileId)
      .then((saved) => ({ saved }));
  }

  @Post()
  @ApiOperation({
    summary: 'Save a provider profile (Client only, idempotent)',
    description: 'Saving an already-saved provider just returns the existing save, unchanged.',
  })
  save(@CurrentUser() user: AuthenticatedUser, @Param('profileId') profileId: string) {
    return this.savedProvidersService.save(user.id, user.role, profileId);
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Unsave a provider profile (Client only, idempotent)',
    description: 'Unsaving something never saved is a no-op, not an error.',
  })
  async unsave(
    @CurrentUser() user: AuthenticatedUser,
    @Param('profileId') profileId: string,
  ): Promise<void> {
    await this.savedProvidersService.unsave(user.id, user.role, profileId);
  }
}
