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
import { PortfolioService } from '../services/portfolio.service';
import { CreatePortfolioDto, UpdatePortfolioDto } from '../dto/portfolio.dto';

@ApiTags('portfolio')
@ApiBearerAuth()
@Controller('portfolio')
@UseGuards(JwtAuthGuard)
export class PortfolioController {
  constructor(private readonly portfolioService: PortfolioService) {}

  @Post()
  @ApiOperation({ summary: 'Add a portfolio item (Provider-only)' })
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreatePortfolioDto) {
    return this.portfolioService.create(user.id, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a portfolio item you own' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdatePortfolioDto,
  ) {
    return this.portfolioService.update(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete a portfolio item you own' })
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    await this.portfolioService.remove(user.id, id);
  }
}
