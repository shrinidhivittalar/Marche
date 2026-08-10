import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../identity/guards/jwt-auth.guard';
import { CurrentUser } from '../../identity/current-user.decorator';
import type { AuthenticatedUser } from '../../identity/strategies/jwt.strategy';
import { SkillsService } from '../services/skills.service';
import { AddSkillDto } from '../dto/add-skill.dto';
import { PaginationQueryDto } from '../dto/pagination-query.dto';

@ApiTags('skills')
@Controller('skills')
export class SkillsController {
  constructor(private readonly skillsService: SkillsService) {}

  @Get()
  @ApiOperation({ summary: 'List the platform skills available to add' })
  list(@Query() pagination: PaginationQueryDto) {
    return this.skillsService.listAvailableSkills(pagination);
  }

  @Post()
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Add a skill to the caller's profile (Provider-only)",
    description:
      'Send skillId to pick one from the platform list, or name to add your own. A typed ' +
      'name is matched against the list case-insensitively first, so it attaches the ' +
      'existing skill rather than creating a near-duplicate.',
  })
  @UseGuards(JwtAuthGuard)
  add(@CurrentUser() user: AuthenticatedUser, @Body() dto: AddSkillDto) {
    return this.skillsService.addSkill(user.id, dto);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a skill you added' })
  @UseGuards(JwtAuthGuard)
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    await this.skillsService.removeSkill(user.id, id);
  }
}
