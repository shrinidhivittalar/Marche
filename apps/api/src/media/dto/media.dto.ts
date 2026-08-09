import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsInt, IsString, MaxLength, Min, MinLength } from 'class-validator';
import { ALLOWED_MIME_TYPES, mediaConfig } from '../media.config';

// What the client is allowed to say about a file it wants to upload. Note
// what is absent: no object key, no visibility, no status, no owner. The
// server decides all four — a client that could choose its own storage path
// or mark its own upload complete would defeat the point of the flow.
export class RequestUploadDto {
  @ApiProperty({ maxLength: mediaConfig.maxFileNameLength })
  @IsString()
  @MinLength(1)
  @MaxLength(mediaConfig.maxFileNameLength)
  fileName!: string;

  @ApiProperty({ enum: ALLOWED_MIME_TYPES })
  @IsIn(ALLOWED_MIME_TYPES as unknown as string[], {
    message: `mimeType must be one of: ${ALLOWED_MIME_TYPES.join(', ')}`,
  })
  mimeType!: string;

  // Checked here so an oversized upload is refused before a URL is issued,
  // and checked again after upload against what storage actually received —
  // a declared size is a claim like any other.
  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  sizeBytes!: number;
}
