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
import { EducationService } from '../services/education.service';
import { CreateEducationDto, UpdateEducationDto } from '../dto/education.dto';

@ApiTags('education')
@ApiBearerAuth()
@Controller('education')
@UseGuards(JwtAuthGuard)
export class EducationController {
  constructor(private readonly educationService: EducationService) {}

  @Post()
  @ApiOperation({ summary: 'Add an education entry (Provider-only)' })
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateEducationDto) {
    return this.educationService.create(user.id, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an education entry you own' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateEducationDto,
  ) {
    return this.educationService.update(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an education entry you own' })
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    await this.educationService.remove(user.id, id);
  }
}
