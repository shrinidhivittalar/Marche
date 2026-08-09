import { Module } from '@nestjs/common';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';
import { MediaRepository } from './media.repository';
import { StorageService } from './storage.service';

// Shared infrastructure, not a business module. MediaService is exported so
// Profiles, Marketplace and later Jobs can check that a file is theirs and
// finished before attaching it — none of them ever touch StorageService,
// which stays private to this module. That is what keeps object storage a
// single-point dependency instead of four.
@Module({
  controllers: [MediaController],
  providers: [MediaService, MediaRepository, StorageService],
  exports: [MediaService],
})
export class MediaModule {}
