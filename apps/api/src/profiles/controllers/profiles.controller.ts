import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../identity/guards/jwt-auth.guard';
import { CurrentUser } from '../../identity/current-user.decorator';
import type { AuthenticatedUser } from '../../identity/strategies/jwt.strategy';
import { ProfilesService } from '../services/profiles.service';
import { UpdateProfileDto } from '../dto/update-profile.dto';
import { UpdateAvailabilityDto } from '../dto/update-availability.dto';

@ApiTags('profiles')
@Controller()
export class ProfilesController {
  constructor(private readonly profilesService: ProfilesService) {}

  @Get('profiles/me')
  @ApiBearerAuth()
  @ApiOperation({ summary: "Return the authenticated user's own full profile" })
  @UseGuards(JwtAuthGuard)
  getMyProfile(@CurrentUser() user: AuthenticatedUser) {
    return this.profilesService.getMyProfile(user.id);
  }

  @Patch('profiles/me')
  @ApiBearerAuth()
  @ApiOperation({ summary: "Update the authenticated user's own profile" })
  @UseGuards(JwtAuthGuard)
  updateMyProfile(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateProfileDto) {
    return this.profilesService.updateMyProfile(user.id, dto);
  }

  @Patch('availability')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update Provider availability status (Provider-only)' })
  @UseGuards(JwtAuthGuard)
  updateAvailability(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateAvailabilityDto) {
    return this.profilesService.updateMyAvailability(user.id, dto);
  }

  @Get('profiles/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'View another profile by id (authenticated; respects visibility)' })
  @UseGuards(JwtAuthGuard)
  getById(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.profilesService.getPublicProfileById(id, user.id);
  }

  @Get('u/:username')
  @ApiOperation({ summary: 'Public profile page by username — no authentication required' })
  getByUsername(@Param('username') username: string) {
    return this.profilesService.getPublicProfileByUsername(username);
  }
}
