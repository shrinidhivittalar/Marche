import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

// Graduation year may legitimately be in the future ("Expected 2027" while
// still enrolled) — see module2-edge-cases.md. Only bounded as a sanity
// check, not rejected outright for being ahead of today.
const MAX_YEARS_AHEAD = 10;
const MIN_YEAR = 1950;

export class CreateEducationDto {
  @ApiProperty()
  @IsString()
  @MaxLength(150)
  institution!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(150)
  degree!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(150)
  fieldOfStudy?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(MIN_YEAR)
  @Max(new Date().getFullYear() + MAX_YEARS_AHEAD)
  graduationYear?: number;
}

export class UpdateEducationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(150)
  institution?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(150)
  degree?: string;

  // Null clears the field, matching how avatarMediaId clears on the profile
  // (update-profile.dto.ts) and endDate on experience. Omitting the field
  // leaves it unchanged, so without an explicit null a value entered once
  // (a mistyped field of study, a graduation that never happened) could never
  // be removed.
  @ApiPropertyOptional({ description: 'Field of study, or null to remove it' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  fieldOfStudy?: string | null;

  @ApiPropertyOptional({ description: 'Graduation year, or null to remove it' })
  @IsOptional()
  @IsInt()
  @Min(MIN_YEAR)
  @Max(new Date().getFullYear() + MAX_YEARS_AHEAD)
  graduationYear?: number | null;
}
