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
import { JwtAuthGuard } from '../identity/guards/jwt-auth.guard';
import { CurrentUser } from '../identity/current-user.decorator';
import type { AuthenticatedUser } from '../identity/strategies/jwt.strategy';
import { MediaService } from './media.service';
import { RequestUploadDto } from './dto/media.dto';

// Every route is authenticated. There is no public media endpoint in
// Phase 1: uploads always belong to someone, and reads go through the
// business entity that references the file rather than through here.
@ApiTags('media')
@Controller('media')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Post('upload-url')
  @ApiOperation({
    summary: 'Authorise an upload and return a short-lived presigned URL',
    description: 'The browser PUTs the file directly to storage. The API never receives the bytes.',
  })
  requestUpload(@CurrentUser() user: AuthenticatedUser, @Body() dto: RequestUploadDto) {
    return this.mediaService.requestUpload(user.id, dto);
  }

  @Post(':id/complete')
  @ApiOperation({
    summary: 'Confirm the upload finished',
    description:
      'Verifies the object exists, is within the size limit, and matches its declared type. ' +
      'Only completed media can be attached to a portfolio, service or job.',
  })
  complete(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.mediaService.completeUpload(user.id, id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Metadata for a file you own' })
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.mediaService.findOwned(user.id, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a file you own' })
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    await this.mediaService.remove(user.id, id);
  }
}
