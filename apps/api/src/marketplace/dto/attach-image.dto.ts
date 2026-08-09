import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

// Only a media id. No URL, no filename, no ordering — the server assigns
// sort order from the current image count, so a client cannot reorder
// another listing's images by inventing a position.
export class AttachImageDto {
  @ApiProperty({ description: 'Id of an uploaded image you own' })
  @IsUUID()
  mediaId!: string;
}
