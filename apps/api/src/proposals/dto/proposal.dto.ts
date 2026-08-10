import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsNumber, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';

// This DTO is the field-level authorization boundary, not merely input
// validation — the same role CreateJobDto plays for requirements. Every field
// a provider may set is here and nothing else is: providerProfileId, status
// and all four lifecycle timestamps are absent by design, so a request
// carrying them cannot reach Prisma whatever the service layer later does
// with the object.
//
// There is no UpdateProposalDto and no PATCH route. A submitted proposal is
// immutable except for withdrawal: without that, a provider could quote
// ₹30,000, wait to be shortlisted, and rewrite it to ₹5,000 — or the reverse
// — which destroys what a proposal means to the client reading it.
export class CreateProposalDto {
  @ApiProperty({ description: 'The requirement being proposed against' })
  @IsUUID()
  jobId!: string;

  // Trimmed before validating, so a message of thirty spaces fails rather
  // than passing a naive MinLength and arriving as an empty card on the
  // client's review screen.
  @ApiProperty({ minLength: 20, maxLength: 3000 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(20)
  @MaxLength(3000)
  coverMessage!: string;

  // Zero is allowed, matching Service.startingPrice: a free or promotional
  // offer is real. The upper bound is a fat-finger guard rather than a
  // business rule, and mirrors Job.budgetMin/Max so a proposal cannot be
  // priced outside the range a requirement could ever express.
  @ApiProperty({ minimum: 0, maximum: 10000000 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(10000000)
  proposedPrice!: number;

  // Days, and named so — "deliveryTime" leaves the unit to be guessed at.
  // The cap is the same fat-finger guard: a three-year turnaround on an
  // event marketplace is a typo, not an offer.
  @ApiProperty({ minimum: 1, maximum: 365, description: 'Working days to deliver' })
  @IsInt()
  @Min(1)
  @Max(365)
  deliveryDays!: number;
}
