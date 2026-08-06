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
import { CertificationService } from '../services/certification.service';
import { CreateCertificationDto, UpdateCertificationDto } from '../dto/certification.dto';

@ApiTags('certification')
@ApiBearerAuth()
@Controller('certification')
@UseGuards(JwtAuthGuard)
export class CertificationController {
  constructor(private readonly certificationService: CertificationService) {}

  @Post()
  @ApiOperation({ summary: 'Add a certification (Provider-only)' })
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateCertificationDto) {
    return this.certificationService.create(user.id, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a certification you own' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateCertificationDto,
  ) {
    return this.certificationService.update(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a certification you own' })
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    await this.certificationService.remove(user.id, id);
  }
}
