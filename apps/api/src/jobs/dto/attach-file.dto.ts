import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

// Only a media id. No URL, no filename, no ordering — the server assigns
// display order from the current attachment count, so a client cannot
// reorder another requirement's files by inventing a position. The file
// name is already recorded on the Media row at upload time.
export class AttachFileDto {
  @ApiProperty({ description: 'Id of an uploaded file you own' })
  @IsUUID()
  mediaId!: string;
}
