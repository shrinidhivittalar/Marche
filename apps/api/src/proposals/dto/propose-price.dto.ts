import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, Max, Min } from 'class-validator';

// The field-level authorization boundary for a negotiation round, same role
// CreateProposalDto plays for the proposal itself: proposalId comes from the
// route param, proposedByProfileId is resolved from the caller, and status
// is never settable — only `amount` is.
export class ProposePriceDto {
  // Same bounds as Proposal.proposedPrice: a negotiated figure cannot be
  // priced outside the range a proposal could ever express in the first
  // place.
  @ApiProperty({ minimum: 0, maximum: 10000000 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(10000000)
  amount!: number;
}
