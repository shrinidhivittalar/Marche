import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { MAX_TAGS_PER_SERVICE } from '../service-tags.util';

// This DTO is the field-level authorization boundary, not just input
// validation. Every field a provider is allowed to set appears here and
// nothing else does — profileId, status, publishedAt, deletedAt and the
// timestamps are all absent by design, so a request carrying them cannot
// reach Prisma no matter what the service layer does with the object.
//
// The global ValidationPipe (whitelist + forbidNonWhitelisted, see main.ts)
// rejects unknown properties with a 400, but that is a backstop: it can
// only reject fields this class does not declare. What is declared here is
// the actual policy.
export class CreateServiceDto {
  @ApiProperty({ maxLength: 120 })
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  title!: string;

  @ApiProperty({ maxLength: 5000 })
  @IsString()
  @MinLength(20)
  @MaxLength(5000)
  description!: string;

  @ApiProperty()
  @IsUUID()
  categoryId!: string;

  // A price of 0 is legitimate (free or promotional listings). The upper
  // bound is a fat-finger guard, not a business rule.
  @ApiProperty({ minimum: 0 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(10000000)
  startingPrice!: number;

  @ApiProperty({ minimum: 1, maximum: 365 })
  @IsInt()
  @Min(1)
  @Max(365)
  deliveryDays!: number;

  @ApiPropertyOptional({ type: [String], maxItems: MAX_TAGS_PER_SERVICE })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_TAGS_PER_SERVICE)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  tags?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID(undefined, { each: true })
  skillIds?: string[];
}

// Safe as a blanket Partial because CreateServiceDto contains only
// caller-writable fields — it cannot widen what is settable. If a
// server-owned field is ever added to the create DTO, this must become an
// explicit class instead.
export class UpdateServiceDto extends PartialType(CreateServiceDto) {}

// Status changes travel through their own endpoint rather than the update
// DTO, so there is one audited path for a visibility change instead of two.
//
// DRAFT is deliberately not accepted: it is the state a listing starts in,
// not one it returns to. "Take it down" is UNPUBLISHED, which is
// distinguishable from never-published — a distinction that would be lost
// if the two collapsed into a boolean.
export class ServiceVisibilityDto {
  @ApiProperty({ enum: ['PUBLISHED', 'UNPUBLISHED'] })
  @IsIn(['PUBLISHED', 'UNPUBLISHED'])
  status!: 'PUBLISHED' | 'UNPUBLISHED';
}
