import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  Validate,
  type ValidationArguments,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';
import { ServiceMode } from '@marche/db';

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

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

// Enough for a real brief, few enough that the field is a list rather than
// a second description someone pasted in bullet form.
const MAX_DELIVERABLES = 20;

// An event time with no event date describes nothing — "the event runs
// 18:00 to 23:00" on no particular day. Caught here rather than stored,
// because a half-specified schedule is worse than none: a provider reads
// the hours and assumes the date is implied somewhere.
@ValidatorConstraint({ name: 'requiresEventDate' })
class RequiresEventDate implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments): boolean {
    const { eventDate } = args.object as CreateJobDto;
    return value === undefined || Boolean(eventDate);
  }

  defaultMessage(args: ValidationArguments): string {
    return `${args.property} needs an eventDate to belong to`;
  }
}

// Same evening only. An event crossing midnight would need a second date
// to say so, and inventing one here would be guessing at what the client
// meant; they can say so in the description until a real end-date exists.
@ValidatorConstraint({ name: 'endTimeAfterStart' })
class EndTimeAfterStart implements ValidatorConstraintInterface {
  validate(eventEndTime: unknown, args: ValidationArguments): boolean {
    const { eventStartTime } = args.object as CreateJobDto;
    if (typeof eventEndTime !== 'string' || typeof eventStartTime !== 'string') return true;
    // Zero-padded HH:MM compares correctly as a string, which is one of the
    // reasons the format is pinned by regex above.
    return eventEndTime > eventStartTime;
  }

  defaultMessage(): string {
    return 'eventEndTime must be later than eventStartTime on the same day';
  }
}

// Proposals that arrive after the event are worthless, so the cutoff
// cannot sit past it. Equal is allowed: "quote me right up to the day" is
// a real, if tight, ask.
@ValidatorConstraint({ name: 'deadlineNotAfterEvent' })
class DeadlineNotAfterEvent implements ValidatorConstraintInterface {
  validate(proposalDeadline: unknown, args: ValidationArguments): boolean {
    const { eventDate } = args.object as CreateJobDto;
    if (typeof proposalDeadline !== 'string' || typeof eventDate !== 'string') return true;
    return new Date(proposalDeadline).getTime() <= new Date(eventDate).getTime();
  }

  defaultMessage(): string {
    return 'proposalDeadline cannot be after the event date';
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

  // Renamed from `location` — see the schema's own comment. This is the
  // coarse, publicly-visible label (city/area). There is no exact-address
  // input on this DTO in this slice; locationExact is populated, if at all,
  // through a separate mechanism not built yet.
  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  locationCoarse?: string;

  // Validated against the category's current active template's
  // allowedModes in JobsService — see
  // CategoryTemplatesService.assertModeAndLocation. A category with no
  // active template configured, or a template with an empty allowedModes,
  // accepts any value here unrestricted; the enum check below is only the
  // structural "is this a real ServiceMode" boundary.
  @ApiPropertyOptional({ enum: ServiceMode })
  @IsOptional()
  @IsEnum(ServiceMode)
  serviceMode?: ServiceMode;

  // Not validated as future-dated. A client legitimately posts about an
  // event already under way, and a hard "must be in the future" check
  // fails at midnight for anyone who filled the form the evening before.
  @ApiPropertyOptional({ description: 'When the work or event actually happens' })
  @IsOptional()
  @IsDateString()
  eventDate?: string;

  // "HH:MM", 24-hour. Wall-clock at the venue rather than an instant — see
  // the schema. The regex is the whole validation: anything that parses
  // here is displayable as written, with no timezone in the middle.
  @ApiPropertyOptional({ example: '18:00', description: 'Event start, 24-hour HH:MM' })
  @IsOptional()
  @Matches(TIME_PATTERN, { message: 'eventStartTime must be a 24-hour time, e.g. 18:00' })
  @Validate(RequiresEventDate)
  eventStartTime?: string;

  @ApiPropertyOptional({ example: '23:00', description: 'Event end, 24-hour HH:MM' })
  @IsOptional()
  @Matches(TIME_PATTERN, { message: 'eventEndTime must be a 24-hour time, e.g. 23:00' })
  @Validate(RequiresEventDate)
  @Validate(EndTimeAfterStart)
  eventEndTime?: string;

  // The cutoff for providers to propose.
  @ApiPropertyOptional({ description: 'Last date providers may submit a proposal' })
  @IsOptional()
  @IsDateString()
  @Validate(DeadlineNotAfterEvent)
  proposalDeadline?: string;

  @ApiPropertyOptional({
    type: [String],
    maxItems: MAX_DELIVERABLES,
    description: 'What the client expects delivered',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_DELIVERABLES)
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  deliverables?: string[];
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
