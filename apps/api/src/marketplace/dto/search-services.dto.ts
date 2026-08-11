import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  Validate,
  ValidatorConstraint,
  type ValidationArguments,
  type ValidatorConstraintInterface,
} from 'class-validator';
import { PaginationQueryDto } from '../../profiles/dto/pagination-query.dto';

export const SUPPORTED_SORTS = ['newest', 'price_low', 'price_high'] as const;

// rating and relevance are rejected rather than quietly aliased to some
// fallback order. Every provider's rating is null until the Reviews module
// exists, so accepting either would return an arbitrary order while
// implying the platform ranks results — a 400 naming the supported values
// is honest and tells the frontend exactly which sorts to render.
const SORT_MESSAGE =
  `sort must be one of: ${SUPPORTED_SORTS.join(', ')}. ` +
  `"relevance" and "rating" are not available until reviews exist.`;

// Rejected here rather than in the service so the caller gets a validation
// error alongside any others, instead of an inverted range silently
// returning zero results — which reads as "nothing exists" rather than
// "your filter is backwards".
@ValidatorConstraint({ name: 'priceRangeOrdered' })
class PriceRangeOrdered implements ValidatorConstraintInterface {
  validate(maxPrice: unknown, args: ValidationArguments): boolean {
    const { minPrice } = args.object as SearchServicesDto;
    if (typeof maxPrice !== 'number' || typeof minPrice !== 'number') return true;
    return maxPrice >= minPrice;
  }

  defaultMessage(): string {
    return 'maxPrice must be greater than or equal to minPrice';
  }
}

export class SearchServicesDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Keyword search over title, description and tags' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @ApiPropertyOptional({ description: 'Category slug; includes the category and its children' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  category?: string;

  @ApiPropertyOptional({
    description: 'Comma-separated skill ids; a service must match all of them',
  })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string'
      ? value
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : value,
  )
  // Skill ids reach Prisma as uuid column values, so a non-uuid here is a
  // database-level error rather than an empty result. Rejected at the
  // boundary as a 400, the same way service.dto.ts validates the same ids.
  @IsUUID(undefined, { each: true })
  skills?: string[];

  @ApiPropertyOptional({ description: "Matches the provider's stored location" })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  location?: string;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Transform(({ value }) => (value === '' || value === undefined ? undefined : Number(value)))
  @IsNumber()
  @Min(0)
  minPrice?: number;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Transform(({ value }) => (value === '' || value === undefined ? undefined : Number(value)))
  @IsNumber()
  @Min(0)
  @Validate(PriceRangeOrdered)
  maxPrice?: number;

  @ApiPropertyOptional({ enum: ['AVAILABLE', 'LIMITED', 'UNAVAILABLE'] })
  @IsOptional()
  @IsIn(['AVAILABLE', 'LIMITED', 'UNAVAILABLE'])
  availability?: 'AVAILABLE' | 'LIMITED' | 'UNAVAILABLE';

  @ApiPropertyOptional({ enum: SUPPORTED_SORTS, default: 'newest' })
  @IsOptional()
  @IsIn(SUPPORTED_SORTS, { message: SORT_MESSAGE })
  sort: (typeof SUPPORTED_SORTS)[number] = 'newest';
}
