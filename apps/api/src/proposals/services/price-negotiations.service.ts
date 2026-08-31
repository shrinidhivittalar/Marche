import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ProfilesRepository } from '../../profiles/repositories/profiles.repository';
import { JobsRepository } from '../../jobs/repositories/jobs.repository';
import { getOwnProfileOrThrow } from '../../profiles/profile-access.util';
import { ProposalsRepository } from '../repositories/proposals.repository';
import { PriceNegotiationsRepository } from '../repositories/price-negotiations.repository';
import type { Job, Proposal, ProposalPriceNegotiation } from '@marche/db';

// Postgres' unique-violation code — same constant and reasoning as
// proposals.service.ts's own isUniqueViolation: the partial unique index
// (proposal_price_negotiations_one_pending_per_proposal) is what actually
// serialises two simultaneous propose() calls on one proposal, and this is
// how the loser's error is turned into a message that names what happened.
const UNIQUE_VIOLATION = 'P2002';

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === UNIQUE_VIOLATION
  );
}

type Party = 'CLIENT' | 'PROVIDER';

/**
 * Negotiated commercial terms on an ordinary (non-direct) Proposal.
 *
 * Deliberately scoped to Proposal, not Job: a Job can carry many Proposals,
 * one per provider, and each provider's negotiation is its own history —
 * nothing here can read or write another provider's rounds, because every
 * query and write is keyed off one proposalId. Job.budgetMin/Max (the
 * client's originally posted ask) is never touched by anything in this
 * service, which is what keeps it historically recoverable with no extra
 * work — see module4.md §8's isDirect note for the analogous reasoning
 * about Job-owned fields.
 *
 * Proposal.proposedPrice is likewise never touched — it stays the immutable
 * snapshot of what was originally offered (proposal.dto.ts's own comment).
 * Proposal.agreedPrice is the only field this service ever writes on
 * Proposal, and only from inside an accepted round's own transaction.
 */
@Injectable()
export class PriceNegotiationsService {
  constructor(
    private readonly negotiationsRepository: PriceNegotiationsRepository,
    private readonly proposalsRepository: ProposalsRepository,
    private readonly jobsRepository: JobsRepository,
    private readonly profilesRepository: ProfilesRepository,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Resolves which of the two roles on this Proposal the caller is, or
   * rejects them. The only two identities with any standing here are the
   * client who owns the Job and the provider who owns the Proposal —
   * mirroring ProposalsService.getOwnProposal / getProposalOnOwnJob, kept
   * as a single combined check here because both parties may act on a
   * negotiation round, unlike the ordinary proposal decisions which are
   * strictly one-sided.
   *
   * Direct-contract proposals are excluded outright (module4.md §8):
   * DirectContractsService already carries its own single, client-set
   * price with its own accept/decline, and Proposals' own withdraw() and
   * getProposalOnOwnJob() already refuse the ordinary lifecycle for them —
   * price negotiation is exactly the same category of "ordinary proposal
   * operation" and gets the same exclusion, for the same reason: a direct
   * offer's price is not something a third mechanism should be able to
   * change out from under DirectContractsService.accept's own claim.
   */
  private async resolveParty(
    userId: string,
    proposalId: string,
  ): Promise<{ role: Party; proposal: Proposal; job: Job; profileId: string }> {
    const proposal = await this.proposalsRepository.findById(proposalId);
    if (!proposal) {
      throw new NotFoundException('Proposal not found');
    }

    const job = await this.jobsRepository.findById(proposal.jobId);
    if (!job) {
      throw new NotFoundException('Proposal not found');
    }

    if (job.isDirect) {
      throw new ForbiddenException(
        'A direct contract offer has a single agreed price set at creation — accept or decline it via the direct-contracts endpoints, not price negotiation',
      );
    }

    const profile = await getOwnProfileOrThrow(this.profilesRepository, userId);

    if (profile.id === proposal.providerProfileId) {
      return { role: 'PROVIDER', proposal, job, profileId: profile.id };
    }
    if (profile.id === job.clientProfileId) {
      return { role: 'CLIENT', proposal, job, profileId: profile.id };
    }
    throw new ForbiddenException('You do not have access to this proposal');
  }

  private assertNegotiable(proposal: Proposal): void {
    // Once a proposal is decided (accepted/rejected) or withdrawn, there is
    // nothing left to negotiate — the deal is either done or dead. Same
    // reasoning as ProposalsService.assertAcceptingProposals gating on
    // status === PUBLISHED for the parent Job.
    if (proposal.status !== 'SUBMITTED') {
      throw new ConflictException('This proposal is no longer open to price negotiation');
    }
  }

  /** Either party — the client who owns the Job, or the provider who owns the Proposal. */
  async propose(
    userId: string,
    proposalId: string,
    amount: number,
  ): Promise<ProposalPriceNegotiation> {
    const { proposal, profileId } = await this.resolveParty(userId, proposalId);
    this.assertNegotiable(proposal);

    try {
      const created = await this.negotiationsRepository.create({
        proposalId,
        proposedByProfileId: profileId,
        amount,
      });
      const withParty = await this.negotiationsRepository.findById(created.id);
      // Cannot be null: created above, in the same request, and nothing
      // deletes rows in this table.
      return withParty!;
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(
          'A price change is already pending on this proposal. It must be accepted, rejected or withdrawn before another can be proposed.',
        );
      }
      throw error;
    }
  }

  /** The party who did NOT propose this round. */
  async accept(
    userId: string,
    proposalId: string,
    negotiationId: string,
  ): Promise<ProposalPriceNegotiation> {
    const { proposal, profileId } = await this.resolveParty(userId, proposalId);
    this.assertNegotiable(proposal);
    const negotiation = await this.getOwnRoundToRespondTo(proposalId, negotiationId, profileId);

    await this.prisma.client.$transaction(async (tx) => {
      const movedRound = await this.negotiationsRepository.transitionFromProposed(
        tx,
        negotiation.id,
        'ACCEPTED',
        profileId,
      );
      if (movedRound === 0) {
        throw new ConflictException('This price change is no longer pending');
      }

      // Re-checked here, not trusted from resolveParty's earlier read: the
      // proposal could have been accepted, rejected or withdrawn through
      // the ordinary proposal routes in between. Conditional on
      // status = SUBMITTED, same pattern as every other transition in this
      // module.
      const movedProposal = await this.negotiationsRepository.claimAgreedPrice(
        tx,
        proposalId,
        negotiation.amount,
      );
      if (movedProposal === 0) {
        throw new ConflictException(
          'This proposal was decided while the price change was pending — nothing was agreed',
        );
      }
    });

    const updated = await this.negotiationsRepository.findById(negotiation.id);
    return updated!;
  }

  /** The party who did NOT propose this round. */
  async reject(
    userId: string,
    proposalId: string,
    negotiationId: string,
  ): Promise<ProposalPriceNegotiation> {
    const { profileId } = await this.resolveParty(userId, proposalId);
    const negotiation = await this.getOwnRoundToRespondTo(proposalId, negotiationId, profileId);

    const moved = await this.negotiationsRepository.transitionFromProposed(
      this.negotiationsRepository.client,
      negotiation.id,
      'REJECTED',
      profileId,
    );
    if (moved === 0) {
      throw new ConflictException('This price change is no longer pending');
    }

    const updated = await this.negotiationsRepository.findById(negotiation.id);
    return updated!;
  }

  /** The party who proposed this round, and only them. */
  async withdraw(
    userId: string,
    proposalId: string,
    negotiationId: string,
  ): Promise<ProposalPriceNegotiation> {
    const { profileId } = await this.resolveParty(userId, proposalId);
    const negotiation = await this.negotiationsRepository.findRawById(negotiationId);
    if (!negotiation || negotiation.proposalId !== proposalId) {
      throw new NotFoundException('Price change not found');
    }
    if (negotiation.proposedByProfileId !== profileId) {
      throw new ForbiddenException('You do not have access to this price change');
    }

    const moved = await this.negotiationsRepository.transitionFromProposed(
      this.negotiationsRepository.client,
      negotiation.id,
      'WITHDRAWN',
      null,
    );
    if (moved === 0) {
      throw new ConflictException('This price change is no longer pending');
    }

    const updated = await this.negotiationsRepository.findById(negotiation.id);
    return updated!;
  }

  /** Readable by either party — the full round-by-round audit trail. */
  async list(userId: string, proposalId: string): Promise<ProposalPriceNegotiation[]> {
    await this.resolveParty(userId, proposalId);
    return this.negotiationsRepository.listByProposal(proposalId);
  }

  /**
   * The responder-side ownership gate shared by accept() and reject():
   * the round must belong to this proposal, and the caller must be the
   * party who did NOT propose it — a proposer accepting or rejecting their
   * own ask would let one side unilaterally set the agreed price.
   */
  private async getOwnRoundToRespondTo(
    proposalId: string,
    negotiationId: string,
    callerProfileId: string,
  ) {
    const negotiation = await this.negotiationsRepository.findRawById(negotiationId);
    if (!negotiation || negotiation.proposalId !== proposalId) {
      throw new NotFoundException('Price change not found');
    }
    if (negotiation.proposedByProfileId === callerProfileId) {
      throw new ForbiddenException('You cannot accept or reject your own price change');
    }
    return negotiation;
  }
}
