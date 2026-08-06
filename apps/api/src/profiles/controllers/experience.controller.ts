import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../identity/guards/jwt-auth.guard';
import { CurrentUser } from '../../identity/current-user.decorator';
import type { AuthenticatedUser } from '../../identity/strategies/jwt.strategy';
import { ExperienceService } from '../services/experience.service';
import { CreateExperienceDto, UpdateExperienceDto } from '../dto/experience.dto';

@ApiTags('experience')
@ApiBearerAuth()
@Controller('experience')
@UseGuards(JwtAuthGuard)
export class ExperienceController {
  constructor(private readonly experienceService: ExperienceService) {}

  @Post()
  @ApiOperation({ summary: 'Add a work experience entry (Provider-only)' })
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateExperienceDto) {
    return this.experienceService.create(user.id, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a work experience entry you own' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateExperienceDto,
  ) {
    return this.experienceService.update(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a work experience entry you own' })
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    await this.experienceService.remove(user.id, id);
  }
}
