import {
  Body,
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
import { SkillsService } from '../services/skills.service';
import { AddSkillDto } from '../dto/add-skill.dto';

@ApiTags('skills')
@Controller('skills')
export class SkillsController {
  constructor(private readonly skillsService: SkillsService) {}

  @Get()
  @ApiOperation({ summary: 'List the predefined platform skills available to add' })
  list() {
    return this.skillsService.listAvailableSkills();
  }

  @Post()
  @ApiBearerAuth()
  @ApiOperation({ summary: "Add a predefined skill to the caller's profile (Provider-only)" })
  @UseGuards(JwtAuthGuard)
  add(@CurrentUser() user: AuthenticatedUser, @Body() dto: AddSkillDto) {
    return this.skillsService.addSkill(user.id, dto.skillId);
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
