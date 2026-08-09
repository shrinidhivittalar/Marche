import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  IsUrl,
  MaxLength,
} from 'class-validator';

export class CreatePortfolioDto {
  @ApiProperty()
  @IsString()
  @MaxLength(150)
  title!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(2000)
  description!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(300)
  coverImage?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  projectDate?: string;

  // Ids of files already uploaded through /media, not URLs. The service
  // checks each one belongs to the caller and has finished uploading, so a
  // portfolio piece can never reference someone else's file or one that
  // never arrived.
  @ApiProperty({ type: [String], description: 'Ids of uploaded media; at least one is required' })
  @IsArray()
  @ArrayMinSize(1, { message: 'At least one image is required' })
  @IsUUID(undefined, { each: true })
  mediaIds!: string[];
}

export class UpdatePortfolioDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(150)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(300)
  coverImage?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  projectDate?: string;

  @ApiPropertyOptional({ enum: ['PUBLIC', 'PRIVATE'] })
  @IsOptional()
  @IsIn(['PUBLIC', 'PRIVATE'])
  visibility?: 'PUBLIC' | 'PRIVATE';
}
