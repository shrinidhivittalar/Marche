import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  Validate,
  type ValidationArguments,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';
import { PaginationQueryDto } from '../../profiles/dto/pagination-query.dto';

export const SUPPORTED_JOB_SORTS = ['newest', 'event_date', 'budget_low', 'budget_high'] as const;

// "relevance" is rejected rather than quietly aliased to newest. There is
// no ranking signal in Phase 1, so accepting it would return an arbitrary
// order while implying the platform ranks results. A 400 naming the
// supported values tells the frontend exactly which sorts to render.
const SORT_MESSAGE =
  `sort must be one of: ${SUPPORTED_JOB_SORTS.join(', ')}. ` +
  '"relevance" is not available: requirements are not ranked in Phase 1.';

// Rejected at validation rather than in the service, so an inverted range
// is reported as the mistake it is instead of silently matching nothing —
// which reads as "no work available" rather than "your filter is backwards".
@ValidatorConstraint({ name: 'jobBudgetRangeOrdered' })
class BudgetRangeOrdered implements ValidatorConstraintInterface {
  validate(maxBudget: unknown, args: ValidationArguments): boolean {
    const { minBudget } = args.object as SearchJobsDto;
    if (typeof maxBudget !== 'number' || typeof minBudget !== 'number') return true;
    return maxBudget >= minBudget;
  }

  defaultMessage(): string {
    return 'maxBudget must be greater than or equal to minBudget';
  }
}

// An untouched form field submits `?minBudget=`, which must mean "no
// filter" rather than 0 — the two differ, and Number('') is 0.
const emptyToNumber = ({ value }: { value: unknown }) =>
  value === '' || value === undefined || value === null ? undefined : Number(value);

export class SearchJobsDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Keyword search over title and description' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @ApiPropertyOptional({ description: 'Category slug; includes the category and its children' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  category?: string;

  @ApiPropertyOptional({ description: "Matches the requirement's stated location" })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  location?: string;

  // Budget filters read from the provider's point of view: "work paying at
  // least X" and "nothing above X". A requirement with no stated budget
  // drops out of a budget-filtered search — a provider filtering on pay
  // cannot evaluate a budget that was never given, and silently including
  // them would fill the results with unanswerable listings.
  @ApiPropertyOptional({
    minimum: 0,
    description: 'Requirements whose budget reaches at least this',
  })
  @IsOptional()
  @Transform(emptyToNumber)
  @IsNumber()
  @Min(0)
  minBudget?: number;

  @ApiPropertyOptional({
    minimum: 0,
    description: 'Requirements whose budget starts no higher than this',
  })
  @IsOptional()
  @Transform(emptyToNumber)
  @IsNumber()
  @Min(0)
  @Validate(BudgetRangeOrdered)
  maxBudget?: number;

  @ApiPropertyOptional({ description: 'Only requirements whose event falls on or after this date' })
  @IsOptional()
  @IsDateString()
  eventFrom?: string;

  @ApiPropertyOptional({
    description: 'Only requirements whose event falls on or before this date',
  })
  @IsOptional()
  @IsDateString()
  eventUntil?: string;

  @ApiPropertyOptional({ enum: SUPPORTED_JOB_SORTS, default: 'newest' })
  @IsOptional()
  @IsIn(SUPPORTED_JOB_SORTS, { message: SORT_MESSAGE })
  sort: (typeof SUPPORTED_JOB_SORTS)[number] = 'newest';
}
