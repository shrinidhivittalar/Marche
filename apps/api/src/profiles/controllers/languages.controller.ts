import {
  Body,
  Controller,
  Delete,
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
import { LanguagesService } from '../services/languages.service';
import { AddLanguageDto } from '../dto/add-language.dto';

@ApiTags('languages')
@ApiBearerAuth()
@Controller('languages')
@UseGuards(JwtAuthGuard)
export class LanguagesController {
  constructor(private readonly languagesService: LanguagesService) {}

  @Post()
  @ApiOperation({ summary: "Add a language to the caller's profile" })
  add(@CurrentUser() user: AuthenticatedUser, @Body() dto: AddLanguageDto) {
    return this.languagesService.addLanguage(user.id, dto.language, dto.proficiency);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a language you added' })
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    await this.languagesService.removeLanguage(user.id, id);
  }
}
