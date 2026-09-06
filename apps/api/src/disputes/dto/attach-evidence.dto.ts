import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

// Same shape as Jobs' AttachFileDto and for the same reason: only a media
// id. The server assigns display order from the current attachment count,
// and the file name is already recorded on the Media row at upload time.
export class AttachEvidenceDto {
  @ApiProperty({ description: 'Id of an uploaded file you own' })
  @IsUUID()
  mediaId!: string;
}
