import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
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

  @ApiProperty({ type: [String], description: 'At least one image URL is required' })
  @IsArray()
  @ArrayMinSize(1, { message: 'At least one image is required' })
  @IsUrl({ protocols: ['https'], require_protocol: true }, { each: true })
  @MaxLength(300, { each: true })
  imageUrls!: string[];
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
