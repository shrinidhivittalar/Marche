import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateExperienceDto {
  @ApiProperty()
  @IsString()
  @MaxLength(150)
  company!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(150)
  position!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiProperty()
  @IsDateString()
  startDate!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  currentlyWorking?: boolean;
}

export class UpdateExperienceDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(150)
  company?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(150)
  position?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  startDate?: string;

  // Null clears the end date, matching how avatarMediaId clears on the
  // profile (update-profile.dto.ts). Omitting the field leaves it unchanged,
  // so without an explicit null a finished entry could never become current
  // again.
  @ApiPropertyOptional({ description: 'ISO date, or null to remove the end date' })
  @IsOptional()
  @IsDateString()
  endDate?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  currentlyWorking?: boolean;
}
