import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsDateString,
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

// Same field-level-authorization-boundary role as CreateJobDto/
// CreateProposalDto: everything a client may set for a direct hire is here
// and nothing else is. No status, no isDirect, no proposal fields the
// service derives on its own.
export class CreateDirectContractDto {
  @ApiProperty({ description: 'The provider being hired directly' })
  @IsUUID()
  providerProfileId!: string;

  @ApiProperty()
  @IsUUID()
  categoryId!: string;

  @ApiProperty({ minLength: 3, maxLength: 120 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  title!: string;

  @ApiProperty({ minLength: 20, maxLength: 3000 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(20)
  @MaxLength(3000)
  description!: string;

  // Same bounds as Proposal.proposedPrice — a direct contract is, under the
  // hood, an already-agreed proposal, so it carries the same fat-finger
  // guard rather than a different one.
  @ApiProperty({ minimum: 0, maximum: 10000000 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(10000000)
  price!: number;

  @ApiProperty({ minimum: 1, maximum: 365 })
  @IsInt()
  @Min(1)
  @Max(365)
  deliveryDays!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  eventDate?: string;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(200)
  location?: string;
}
