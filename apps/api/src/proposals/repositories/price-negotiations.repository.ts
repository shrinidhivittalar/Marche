import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { Prisma, ProposalPriceNegotiation, ProposalPriceNegotiationStatus } from '@marche/db';

// Which timestamp a decision stamps. Mirrors proposals.repository.ts's own
// DECIDED_AT map — same reasoning: adding a state means adding a line here,
// not a branch in the transition method.
const RESPONDED_STATES: ProposalPriceNegotiationStatus[] = ['ACCEPTED', 'REJECTED', 'WITHDRAWN'];

const NEGOTIATION_FIELDS = {
  id: true,
  proposalId: true,
  amount: true,
  status: true,
  createdAt: true,
  respondedAt: true,
  proposedByProfileId: true,
  respondedByProfileId: true,
  proposedByProfile: { select: { id: true, displayName: true } },
  respondedByProfile: { select: { id: true, displayName: true } },
} satisfies Prisma.ProposalPriceNegotiationSelect;

@Injectable()
export class PriceNegotiationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string) {
    return this.prisma.client.proposalPriceNegotiation.findUnique({
      where: { id },
      select: NEGOTIATION_FIELDS,
    });
  }

  // The bare row, for the transition guard — status and the two profile ids
  // are all it needs, not the joined display names.
  findRawById(id: string) {
    return this.prisma.client.proposalPriceNegotiation.findUnique({ where: { id } });
  }

  // Full history, oldest first — the audit trail is read top-to-bottom as a
  // timeline, not newest-first like a notification feed.
  listByProposal(proposalId: string) {
    return this.prisma.client.proposalPriceNegotiation.findMany({
      where: { proposalId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: NEGOTIATION_FIELDS,
    });
  }

  // Optional `client` so the same check can be re-run inside a transaction
  // (see ProposalsService.accept, which re-checks against `tx` for read
  // consistency with the writes landing in that same transaction) as well as
  // stand alone for the ordinary pre-transaction fast path.
  hasPending(
    proposalId: string,
    client: Prisma.TransactionClient = this.prisma.client,
  ): Promise<boolean> {
    return client.proposalPriceNegotiation
      .count({ where: { proposalId, status: 'PROPOSED' } })
      .then((count) => count > 0);
  }

  // Race safety is the partial unique index in the migration
  // (proposal_price_negotiations_one_pending_per_proposal), not this insert
  // — a second simultaneous propose() on the same proposal both pass any
  // service-layer pre-check and only the database decides between them.
  create(data: {
    proposalId: string;
    proposedByProfileId: string;
    amount: number;
  }): Promise<ProposalPriceNegotiation> {
    return this.prisma.client.proposalPriceNegotiation.create({ data });
  }

  /**
   * Moves one round out of PROPOSED, but only if it is still there.
   *
   * `updateMany` rather than `update`, same reasoning as
   * ProposalsRepository.transitionFromSubmitted: the status test travels
   * inside the UPDATE, so two people responding to the same round at once
   * (or the proposer withdrawing while the other party responds) is
   * serialised by Postgres on the row — the loser matches zero rows instead
   * of overwriting the winner's decision.
   */
  transitionFromProposed(
    client: Prisma.TransactionClient,
    id: string,
    to: Exclude<ProposalPriceNegotiationStatus, 'PROPOSED'>,
    respondedByProfileId: string | null,
  ): Promise<number> {
    return client.proposalPriceNegotiation
      .updateMany({
        where: { id, status: 'PROPOSED' },
        data: {
          status: to,
          respondedByProfileId: RESPONDED_STATES.includes(to) ? respondedByProfileId : undefined,
          respondedAt: new Date(),
        },
      })
      .then((result) => result.count);
  }

  // The ordinary Prisma client, for the one decision that is a single write
  // (reject/withdraw). Accept runs inside ProposalsRepository-style
  // transaction composition instead, since it also writes agreedPrice.
  get client(): Prisma.TransactionClient {
    return this.prisma.client;
  }

  /**
   * Writes the accepted round's amount onto Proposal.agreedPrice — but only
   * if the parent proposal is still SUBMITTED. Conditional for the same
   * reason every other transition here is: the proposal could have been
   * accepted, rejected or withdrawn (via the ordinary proposal routes) in
   * the moment between reading it and responding to a negotiation round,
   * and agreeing on a price for a decision that no longer exists must not
   * silently succeed.
   */
  claimAgreedPrice(
    client: Prisma.TransactionClient,
    proposalId: string,
    amount: Prisma.Decimal | number,
  ): Promise<number> {
    return client.proposal
      .updateMany({
        where: { id: proposalId, status: 'SUBMITTED' },
        data: { agreedPrice: amount, agreedPriceAt: new Date() },
      })
      .then((result) => result.count);
  }
}
