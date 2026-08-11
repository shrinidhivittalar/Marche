import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../identity/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../../identity/guards/optional-jwt-auth.guard';
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

  // Optional auth, not none: the page stays readable anonymously, but a
  // signed-in caller is identified so the owner escape hatch in
  // readableProfileWhere can fire. Without a viewer id a suspended owner —
  // or one whose profile is PRIVATE — got a 404 on their own public page
  // while logged in, and had no way to see what the public could not.
  @Get('u/:username')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Public profile page by username — authentication optional' })
  @UseGuards(OptionalJwtAuthGuard)
  getByUsername(@Param('username') username: string, @CurrentUser() user?: AuthenticatedUser) {
    return this.profilesService.getPublicProfileByUsername(username, user?.id);
  }
}
