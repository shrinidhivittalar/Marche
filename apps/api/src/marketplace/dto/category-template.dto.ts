import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { CategoryTemplateFieldType } from '@marche/db';

// Same machine-key shape Category.slug already validates — a stable
// identifier a future Job.categoryData (Slice 4) will be keyed by.
const FIELD_KEY_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const MAX_FIELDS = 40;

// This DTO is the field-level authorization boundary for one question in a
// template, the same role CreateProposalDto plays for a proposal: every
// property an admin may set is here and nothing else is. There is no id —
// fields are created only as part of their parent template and never
// addressed individually.
export class CreateCategoryTemplateFieldDto {
  @ApiProperty({ maxLength: 80 })
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  @Matches(FIELD_KEY_PATTERN, {
    message: 'key must be lowercase alphanumeric words separated by single hyphens',
  })
  key!: string;

  @ApiProperty({ maxLength: 200 })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  label!: string;

  @ApiProperty({ enum: CategoryTemplateFieldType })
  @IsEnum(CategoryTemplateFieldType)
  type!: CategoryTemplateFieldType;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @ApiPropertyOptional({ minimum: 0, default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;

  // Structural shape only — an array of strings. Whether options are
  // present at all is appropriate for `type` (SELECT/MULTI_SELECT only) is
  // checked in the service, where it can be judged against the sibling
  // `type` field; a single-property decorator here cannot see that.
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @IsString({ each: true })
  options?: string[];

  // Structural shape only — a plain object. Which keys are meaningful
  // depends on `type` (min/max for NUMBER, minLength/maxLength for TEXT),
  // checked in the service for the same reason as `options` above. Not a
  // JSON-Schema document or a rules DSL — see CategoryTemplateFieldType's
  // own comment in schema.prisma.
  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  validation?: Record<string, unknown>;
}

// Creating a template and activating it are the same action — there is no
// draft state and no separate "publish" step. A version is submitted
// complete, exactly like CreateJobDto's own shape and for the same reason:
// a half-configured template is a form the admin UI can hold in local
// state until it's ready, not something the database needs to represent.
export class CreateCategoryTemplateDto {
  @ApiProperty({ type: [CreateCategoryTemplateFieldDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_FIELDS)
  @ValidateNested({ each: true })
  @Type(() => CreateCategoryTemplateFieldDto)
  fields!: CreateCategoryTemplateFieldDto[];
}
