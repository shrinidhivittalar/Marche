import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  Validate,
  type ValidationArguments,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';

// Rejected at validation rather than in the service, so an inverted range
// is reported as the mistake it is instead of silently matching nothing.
// Same reasoning and shape as SearchServicesDto's PriceRangeOrdered.
@ValidatorConstraint({ name: 'budgetRangeOrdered' })
class BudgetRangeOrdered implements ValidatorConstraintInterface {
  validate(budgetMax: unknown, args: ValidationArguments): boolean {
    const { budgetMin } = args.object as CreateJobDto;
    if (typeof budgetMax !== 'number' || typeof budgetMin !== 'number') return true;
    return budgetMax >= budgetMin;
  }

  defaultMessage(): string {
    return 'budgetMax must be greater than or equal to budgetMin';
  }
}

// This DTO is the field-level authorization boundary, not merely input
// validation — the same role CreateServiceDto plays for services. Every
// field a client may set is here and nothing else is: clientProfileId,
// status, publishedAt, cancelledAt and the timestamps are absent by
// design, so a request carrying them cannot reach Prisma whatever the
// service layer later does with the object.
//
// A job is created complete and starts as a DRAFT, exactly like a service.
// module4.md describes "save draft, then add details", which could argue
// for nullable title and description — but that would make every read path
// handle a job with no title, to support a half-filled form the frontend
// can hold in local state until it is ready to submit.
export class CreateJobDto {
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

  // Optional, and a range: a client posting work usually knows roughly what
  // they can spend, not an exact figure. The upper bound is a fat-finger
  // guard rather than a business rule, matching Service.startingPrice.
  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(10000000)
  budgetMin?: number;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(10000000)
  @Validate(BudgetRangeOrdered)
  budgetMax?: number;

  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  location?: string;

  // Not validated as future-dated. A client legitimately posts about an
  // event already under way, and a hard "must be in the future" check
  // fails at midnight for anyone who filled the form the evening before.
  @ApiPropertyOptional({ description: 'When the work or event actually happens' })
  @IsOptional()
  @IsDateString()
  eventDate?: string;
}

// Safe as a blanket Partial because CreateJobDto contains only
// caller-writable fields — it cannot widen what is settable. If a
// server-owned field is ever added to the create DTO, this must become an
// explicit class instead.
//
// Status is deliberately not here. Publishing and cancelling are their own
// endpoints, so a lifecycle change has one auditable path rather than
// being one field among many in a general edit — and so a client cannot
// reach FILLED, which only Module 5 may set.
export class UpdateJobDto extends PartialType(CreateJobDto) {}
