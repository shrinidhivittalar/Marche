import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ProfilesRepository } from '../../profiles/repositories/profiles.repository';
import { JobsRepository } from '../../jobs/repositories/jobs.repository';
import { CategoriesRepository } from '../../marketplace/repositories/categories.repository';
import { ProposalsRepository } from '../../proposals/repositories/proposals.repository';
import { ConnectionsRepository } from '../../proposals/repositories/connections.repository';
import { NotificationsService } from '../../notifications/services/notifications.service';
import {
  assertClientRole,
  assertProviderRole,
  getOwnProfileOrThrow,
} from '../../profiles/profile-access.util';
import type { CreateDirectContractDto } from '../dto/create-direct-contract.dto';

// Reuses the same Job -> Proposal -> Connection pipeline the marketplace
// hire flow does, per CLAUDE.md's "reuse before invent" — a direct contract
// is a real Connection once accepted, so Payments/Reviews/Disputes/Work
// Diary all work on it unchanged. What's different is only how it's made:
// no public listing, no competing proposals, and the client — not a
// provider — authors the offer.
//
// The offer sits as a SUBMITTED Proposal on a DRAFT (never PUBLISHED,
// already invisible to the marketplace via job-visibility.ts's isDirect
// check) Job until the named provider accepts or declines it. A negative
// security test found the earlier version skipped this entirely — it
// created an ACTIVE Connection straight from the client's request, so a
// provider could be bound into a paid or unpaid engagement they never
// agreed to. This mirrors ProposalsService.accept()'s claim-then-transition
// pattern, just triggered by the provider instead of the client, since here
// the provider is the party whose consent is missing.
@Injectable()
export class DirectContractsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly profilesRepository: ProfilesRepository,
    private readonly jobsRepository: JobsRepository,
    private readonly categoriesRepository: CategoriesRepository,
    private readonly proposalsRepository: ProposalsRepository,
    private readonly connectionsRepository: ConnectionsRepository,
    private readonly notificationsService: NotificationsService,
  ) {}

  /** Client only. Creates the offer; nothing is binding until the provider accepts it. */
  async create(clientUserId: string, dto: CreateDirectContractDto) {
    const clientProfile = await getOwnProfileOrThrow(this.profilesRepository, clientUserId);
    assertClientRole(clientProfile.user.role);

    const providerProfile = await this.profilesRepository.findById(dto.providerProfileId);
    if (!providerProfile) {
      throw new NotFoundException('Provider not found');
    }
    assertProviderRole(providerProfile.user.role);
    if (providerProfile.userId === clientUserId) {
      throw new BadRequestException('You cannot hire yourself');
    }

    const category = await this.categoriesRepository.findById(dto.categoryId);
    if (!category) {
      throw new BadRequestException('Category not found');
    }

    // The job and its proposal come into existence together or not at all —
    // a proposal with no job behind it, or vice versa, is meaningless. Left
    // as DRAFT: never published, never discoverable (job-visibility.ts
    // excludes isDirect regardless of status anyway, but DRAFT also means
    // ProposalsService.submit() refuses anyone else a proposal on it, since
    // assertAcceptingProposals requires PUBLISHED).
    const { job, proposal } = await this.prisma.client.$transaction(async (tx) => {
      const job = await tx.job.create({
        data: {
          clientProfileId: clientProfile.id,
          categoryId: dto.categoryId,
          title: dto.title,
          description: dto.description,
          // Both bounds set to the same figure — a direct contract has one
          // agreed price, not a range to be proposed within.
          budgetMin: dto.price,
          budgetMax: dto.price,
          location: dto.location,
          eventDate: dto.eventDate ? new Date(dto.eventDate) : undefined,
          status: 'DRAFT',
          isDirect: true,
        },
      });

      const proposal = await tx.proposal.create({
        data: {
          jobId: job.id,
          providerProfileId: providerProfile.id,
          coverMessage: 'Direct contract, offered outside the marketplace.',
          proposedPrice: dto.price,
          deliveryDays: dto.deliveryDays,
          status: 'SUBMITTED',
          submittedAt: new Date(),
        },
      });

      return { job, proposal };
    });

    await this.notificationsService.directContractOffered(providerProfile.userId, {
      jobId: job.id,
      proposalId: proposal.id,
    });

    return proposal;
  }

  /** Provider only — the named recipient of the offer. Creates the connection. */
  async accept(providerUserId: string, proposalId: string) {
    const { proposal, job, providerProfile } = await this.getOwnOffer(providerUserId, proposalId);

    const connection = await this.prisma.client.$transaction(async (tx) => {
      // Conditional UPDATE, same reasoning as ProposalsService.accept's
      // claimFilled call: without it, two near-simultaneous accept requests
      // (e.g. a doubled click) could both pass a read-then-write check and
      // both try to create a Connection, tripping Connection.jobId's unique
      // constraint instead of failing with a clear message.
      const claimed = await this.jobsRepository.claimFilled(tx, job.id, ['DRAFT']);
      if (claimed === 0) {
        throw new ConflictException('This offer is no longer available');
      }

      const moved = await this.proposalsRepository.transitionFromSubmitted(
        tx,
        proposal.id,
        'ACCEPTED',
      );
      if (moved === 0) {
        throw new ConflictException('This offer is no longer available');
      }

      return this.connectionsRepository.create(tx, {
        jobId: job.id,
        proposalId: proposal.id,
        clientProfileId: job.clientProfileId,
        providerProfileId: providerProfile.id,
      });
    });

    await this.notificationsService.directContractAccepted(job.clientProfileUserId, {
      connectionId: connection.id,
      jobId: connection.job.id,
      proposalId: connection.proposal.id,
    });
    await this.notificationsService.connectionEstablished(
      [job.clientProfileUserId, providerUserId],
      {
        connectionId: connection.id,
        jobId: connection.job.id,
        proposalId: connection.proposal.id,
      },
    );

    return connection;
  }

  /** Provider only. Declining leaves the job dead in DRAFT — it was never discoverable anyway. */
  async decline(providerUserId: string, proposalId: string): Promise<void> {
    const { proposal, job } = await this.getOwnOffer(providerUserId, proposalId);

    const moved = await this.proposalsRepository.transitionFromSubmitted(
      this.proposalsRepository.client,
      proposal.id,
      'REJECTED',
    );
    if (moved === 0) {
      throw new ConflictException('This offer has already been decided');
    }

    await this.notificationsService.directContractDeclined(job.clientProfileUserId, {
      jobId: job.id,
      proposalId: proposal.id,
    });
  }

  /**
   * The provider-side ownership gate for accept/decline: the caller must be
   * the specific provider the offer names, not merely any provider. 403
   * rather than 404 for someone else's offer, matching
   * ProposalsService.getOwnProposal.
   */
  private async getOwnOffer(providerUserId: string, proposalId: string) {
    const providerProfile = await getOwnProfileOrThrow(this.profilesRepository, providerUserId);
    const proposal = await this.proposalsRepository.findById(proposalId);
    if (!proposal) {
      throw new NotFoundException('Offer not found');
    }
    if (proposal.providerProfileId !== providerProfile.id) {
      throw new ForbiddenException('You do not have access to this offer');
    }

    const job = await this.jobsRepository.findById(proposal.jobId);
    if (!job || !job.isDirect) {
      throw new NotFoundException('Offer not found');
    }

    const clientUserId = await this.profilesRepository.findUserIdById(job.clientProfileId);
    if (!clientUserId) {
      throw new NotFoundException('Offer not found');
    }

    return {
      proposal,
      job: { ...job, clientProfileUserId: clientUserId },
      providerProfile,
    };
  }
}
