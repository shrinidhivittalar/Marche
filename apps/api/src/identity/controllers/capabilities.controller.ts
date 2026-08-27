import { BadRequestException, Controller, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { CurrentUser } from '../current-user.decorator';
import { CapabilitiesService } from '../services/capabilities.service';
import type { AuthenticatedUser } from '../strategies/jwt.strategy';
import type { Capability } from '@marche/db';

const VALID_CAPABILITIES: Capability[] = ['CLIENT', 'PROVIDER'];

@ApiTags('identity')
@Controller('identity/capabilities')
export class CapabilitiesController {
  constructor(private readonly capabilitiesService: CapabilitiesService) {}

  // module1-implementation-contract.md §2.3 — grants the caller's own
  // identity a capability. Never accepts a target userId: activation is
  // always self-service, never on behalf of another identity.
  @Post(':capability/activate')
  @HttpCode(200)
  @ApiBearerAuth()
  @ApiParam({ name: 'capability', enum: VALID_CAPABILITIES })
  @ApiOperation({ summary: 'Activate a marketplace capability for the current identity' })
  @UseGuards(JwtAuthGuard)
  async activate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('capability') capability: string,
  ): Promise<{ status: 'activated' }> {
    if (!VALID_CAPABILITIES.includes(capability as Capability)) {
      throw new BadRequestException('capability must be CLIENT or PROVIDER');
    }
    await this.capabilitiesService.activate(user.id, capability as Capability);
    return { status: 'activated' };
  }
}
