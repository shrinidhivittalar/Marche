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
import { JobsService } from '../../jobs/services/jobs.service';
import { MediaService } from '../../media/media.service';
import {
  assertEmailVerified,
  assertProviderRole,
  getOwnProfileOrThrow,
} from '../../profiles/profile-access.util';
import { paginate } from '../../marketplace/pagination';
import { NotificationsService } from '../../notifications/services/notifications.service';
import { ProposalsRepository } from '../repositories/proposals.repository';
import { ConnectionsRepository } from '../repositories/connections.repository';
import { PriceNegotiationsRepository } from '../repositories/price-negotiations.repository';
import type { CreateProposalDto } from '../dto/proposal.dto';
import type { PaginationQueryDto } from '../../profiles/dto/pagination-query.dto';
import type { Job, Proposal } from '@marche/db';

// Postgres' unique-violation code, surfaced by Prisma. Unlike the RESTRICT
// violations Module 3 found (which arrive as an unmapped error with no code
// at all), a duplicate key is mapped, so it can be matched on.
const UNIQUE_VIOLATION = 'P2002';

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === UNIQUE_VIOLATION
  );
}

@Injectable()
export class ProposalsService {
  // Capped for the same reason a requirement's attachments are: a proposal
  // carrying twenty files is a document dump, not an offer.
  private static readonly MAX_ATTACHMENTS = 5;

  constructor(
    private readonly proposalsRepository: ProposalsRepository,
    private readonly connectionsRepository: ConnectionsRepository,
    private readonly priceNegotiationsRepository: PriceNegotiationsRepository,
    private readonly profilesRepository: ProfilesRepository,
    private readonly jobsRepository: JobsRepository,
    private readonly jobsService: JobsService,
    private readonly mediaService: MediaService,
    private readonly notificationsService: NotificationsService,
    private readonly prisma: PrismaService,
  ) {}

  // ---------- provider-owned writes ----------

  async submit(userId: string, dto: CreateProposalDto): Promise<Proposal> {
    const profile = await this.getOwnProfile(userId);
    // Re-read at submission rather than trusted from an earlier check: a
    // provider can be suspended or have their role changed between opening
    // the form and sending it, and this is the moment an offer becomes real.
    assertProviderRole(profile.user);
    // Module 01 Slice 5: EMAIL verification required at submission — the
    // moment an offer becomes real to the client on the other side.
    assertEmailVerified(profile.user);

    const job = await this.jobsRepository.findById(dto.jobId);
    if (!job) {
      throw new NotFoundException('Requirement not found');
    }

    // Ownership before eligibility: "you cannot propose on your own
    // requirement" is a clearer answer than "this requirement is not
    // accepting proposals", which is what a client-owned draft would
    // otherwise return.
    //
    // Self-dealing check (Module 01 Slice 2, primary enforcement point per
    // module1-implementation-contract.md §6.2): compares canonical User.id,
    // not Profile.id. profile.userId is the caller's own User.id (profile
    // was already resolved from userId above); the job's owning user is
    // looked up the same way, rather than compared as job.clientProfileId
    // === profile.id — the two forms are provably equivalent given
    // Profile.userId's uniqueness (contract §6.1), but the canonical form
    // is what must be written here.
    const clientUserId = await this.profilesRepository.findUserIdById(job.clientProfileId);
    if (clientUserId === userId) {
      throw new ForbiddenException('You cannot propose on your own requirement');
    }

    this.assertAcceptingProposals(job);
    await this.assertNoExistingProposal(job.id, profile.id);

    try {
      // Fields are enumerated rather than spread. The DTO already cannot
      // carry providerProfileId or status past the ValidationPipe, but
      // listing them means a field added to the DTO later reaches the
      // database only when someone adds it here deliberately.
      const proposal = await this.proposalsRepository.create({
        jobId: job.id,
        providerProfileId: profile.id,
        coverMessage: dto.coverMessage,
        proposedPrice: dto.proposedPrice,
        deliveryDays: dto.deliveryDays,
      });

      // After the write commits, not before — a notification for a proposal
      // that failed to save would tell the client about an offer that
      // doesn't exist.
      await this.notifyRecipient(job.clientProfileId, (recipientUserId) =>
        this.notificationsService.proposalSubmitted(recipientUserId, {
          jobId: job.id,
          proposalId: proposal.id,
        }),
      );

      return proposal;
    } catch (error) {
      // The check above handles the ordinary sequential case and gives a
      // better message. This handles the real one: two simultaneous
      // submissions both pass that check before either writes, and only the
      // database can decide between them.
      if (isUniqueViolation(error)) {
        throw new ConflictException('You have already proposed on this requirement');
      }
      throw error;
    }
  }

  async withdraw(userId: string, proposalId: string): Promise<void> {
    const { proposal } = await this.getOwnProposal(userId, proposalId);
    const job = await this.jobsRepository.findById(proposal.jobId);

    // A direct contract's "proposal" is the client's own offer to this
    // provider (DirectContractsService), not something the provider
    // authored — deciding it belongs to DirectContractsService.accept/
    // decline, which notifies the client correctly ("declined") and keeps
    // it off the ordinary proposal lifecycle. Without this, a provider
    // could withdraw() a direct offer here instead, firing
    // proposalWithdrawn (misleadingly implying the client's own offer was
    // "withdrawn") rather than directContractDeclined.
    if (job?.isDirect) {
      throw new ForbiddenException(
        'A direct contract offer is accepted or declined via the direct-contracts endpoints, not withdrawn',
      );
    }

    const moved = await this.proposalsRepository.transitionFromSubmitted(
      this.proposalsRepository.client,
      proposal.id,
      'WITHDRAWN',
    );

    // Zero rows means someone else moved it first — the client accepted or
    // rejected it in the moment between the read above and this write. The
    // status is re-read for the message rather than assumed, since "already
    // accepted" and "already rejected" are different news.
    if (moved === 0) {
      throw new ConflictException(await this.decidedMessage(proposal.id));
    }

    if (job) {
      await this.notifyRecipient(job.clientProfileId, (recipientUserId) =>
        this.notificationsService.proposalWithdrawn(recipientUserId, {
          jobId: proposal.jobId,
          proposalId: proposal.id,
        }),
      );
    }
  }

  // ---------- client decisions ----------

  /**
   * Accepts a proposal: fills the requirement, rejects the competition, and
   * establishes the connection.
   *
   * The most important transaction in the module. All four writes land or
   * none do — a requirement that is FILLED while two losing proposals still
   * read SUBMITTED tells those providers they are in the running for
   * something already decided.
   *
   * The claim goes first, deliberately (ADR-006). It is what serialises two
   * clients accepting two different proposals on the same requirement, and
   * putting it first means the loser rolls back having written nothing at
   * all.
   */
  async accept(userId: string, proposalId: string) {
    const { proposal, job, profile } = await this.getProposalOnOwnJob(userId, proposalId);

    // Defensive re-check (Module 01 Slice 2,
    // module1-implementation-contract.md §6.2): submit() already rejects a
    // provider proposing on their own requirement, so this should be
    // unreachable in practice — repeated here, at the other end of the
    // same transaction pair, in case that upstream guard is ever bypassed,
    // weakened, or the two checks drift apart. Compares canonical User.id,
    // not Profile.id (contract §6.1) — profile.userId is the accepting
    // client's own User.id (getProposalOnOwnJob resolved it from userId
    // already); providerUserId is looked up fresh here rather than trusted
    // from anywhere upstream, and reused below for the post-commit
    // notifications instead of being fetched a second time.
    const providerUserId = await this.profilesRepository.findUserIdById(proposal.providerProfileId);
    if (providerUserId === userId) {
      throw new ForbiddenException('You cannot accept your own proposal');
    }

    // A proposal with a price round still PROPOSED is ambiguous: accepting
    // it now would leave it unclear whether the client meant to accept the
    // original proposedPrice or the pending ask. The other party must
    // accept, reject or withdraw the round first, through the price
    // negotiation endpoints — see PriceNegotiationsService.
    if (await this.priceNegotiationsRepository.hasPending(proposal.id)) {
      throw new ConflictException(
        'This proposal has a pending price change. Resolve it before accepting.',
      );
    }

    const connection = await this.prisma.client.$transaction(
      async (tx) => {
        // The check above handles the ordinary sequential case and gives a
        // better message. This handles the real one: the other party can
        // propose a price change in the window between that check and this
        // transaction's writes landing, which would otherwise leave the
        // round permanently PROPOSED on a proposal that's already ACCEPTED,
        // with nothing left to resolve it. Read against `tx` for consistency
        // with the writes below, not the ordinary client.
        if (await this.priceNegotiationsRepository.hasPending(proposal.id, tx)) {
          throw new ConflictException(
            'This proposal has a pending price change. Resolve it before accepting.',
          );
        }

        // Throws 409 if the requirement is no longer claimable. The rule about
        // which statuses may become FILLED lives in JobsService, which owns
        // the Job lifecycle.
        await this.jobsService.claimFilled(tx, job.id);

        const moved = await this.proposalsRepository.transitionFromSubmitted(
          tx,
          proposal.id,
          'ACCEPTED',
        );
        // The requirement was claimable but this proposal was not: the
        // provider withdrew it between the read and this write. Rolling back
        // leaves the requirement open, which is correct — nothing was agreed.
        if (moved === 0) {
          throw new ConflictException(
            'That proposal is no longer available. It may have been withdrawn.',
          );
        }

        await this.proposalsRepository.rejectCompeting(tx, job.id, proposal.id);

        return this.connectionsRepository.create(tx, {
          jobId: job.id,
          proposalId: proposal.id,
          clientProfileId: profile.id,
          providerProfileId: proposal.providerProfileId,
        });
        // Prisma's default interactive-transaction timeout is 5 seconds, and
        // this body was measured at ~5.2 against the hosted database — four
        // writes at roughly 275ms of round trip each, plus commit. It fits
        // under the default often enough to look fine and fails as a 500 on
        // the single most important write in the product when it does not.
        //
        // Raised rather than papered over with a retry: nothing here is
        // unsafe to wait for. The correctness of a concurrent accept comes
        // from the conditional UPDATEs inside (see claimFilled and
        // transitionFromSubmitted, and the concurrency spec that proves it),
        // not from how long the transaction is allowed to take.
        //
        // The lasting fix is fewer round trips in here, which is a change to
        // how these three writes are expressed and does not belong in the
        // commit that found the problem.
      },
      { timeout: 15_000, maxWait: 5_000 },
    );

    // After commit, not before (module6.md, "Transaction Boundary"). Two
    // distinct events, deliberately not collapsed into one: ProposalAccepted
    // is the decision, ConnectionEstablished is the channel it opens, and the
    // provider is the recipient of both. providerUserId was already resolved
    // above for the self-dealing check — reused here rather than re-queried.
    if (providerUserId) {
      await this.notificationsService.proposalAccepted(providerUserId, {
        jobId: job.id,
        proposalId: proposal.id,
      });
      await this.notificationsService.connectionEstablished([profile.userId, providerUserId], {
        connectionId: connection.id,
        jobId: job.id,
        proposalId: proposal.id,
      });
    }

    return connection;
  }

  async reject(userId: string, proposalId: string): Promise<void> {
    const { proposal } = await this.getProposalOnOwnJob(userId, proposalId);

    const moved = await this.proposalsRepository.transitionFromSubmitted(
      this.proposalsRepository.client,
      proposal.id,
      'REJECTED',
    );

    if (moved === 0) {
      throw new ConflictException(await this.decidedMessage(proposal.id));
    }

    await this.notifyRecipient(proposal.providerProfileId, (recipientUserId) =>
      this.notificationsService.proposalRejected(recipientUserId, {
        jobId: proposal.jobId,
        proposalId: proposal.id,
      }),
    );
  }

  // ---------- reads ----------

  async listMine(userId: string, pagination: PaginationQueryDto) {
    const profile = await this.getOwnProfile(userId);
    const { page, limit } = pagination;

    const [data, total] = await Promise.all([
      this.proposalsRepository.listByProvider(profile.id, (page - 1) * limit, limit),
      this.proposalsRepository.countByProvider(profile.id),
    ]);

    return paginate(data, total, page, limit);
  }

  /**
   * One proposal, read by either party to it.
   *
   * The provider who wrote it and the client who received it see different
   * shapes: the provider needs the requirement it targets, the client needs
   * who is offering. Neither sees anything about the competition.
   */
  async findById(userId: string, proposalId: string) {
    const { proposal, profile } = await this.getProposalAsParty(userId, proposalId);

    if (proposal.providerProfileId !== profile.id) {
      // The client branch. getProposalAsParty already proved this caller
      // owns the Job this proposal targets, but findByIdForClient does not
      // embed the job at all — the client already has it via GET /jobs/me/:id,
      // which is where its own locationExact is read. Nothing to merge here.
      return this.proposalsRepository.findByIdForClient(proposal.id);
    }

    const own = await this.proposalsRepository.findByIdForProvider(proposal.id);
    if (!own) return own;

    // The provider branch. Only entitled to locationExact once actually
    // hired for this job — the Connection row is the authoritative "hired"
    // fact (see module4.md §8 / jobs.repository.ts), not this proposal's
    // own status column.
    const hiredProviderProfileId = await this.jobsRepository.findHiredProviderProfileId(
      proposal.jobId,
    );
    const locationExact =
      hiredProviderProfileId === profile.id
        ? await this.jobsRepository.findLocationExact(proposal.jobId)
        : null;

    return { ...own, job: { ...own.job, locationExact } };
  }

  async listForJob(userId: string, jobId: string, pagination: PaginationQueryDto) {
    const job = await this.getOwnJob(userId, jobId);
    const { page, limit } = pagination;

    const [data, total] = await Promise.all([
      this.proposalsRepository.listByJob(job.id, (page - 1) * limit, limit),
      this.proposalsRepository.countByJob(job.id),
    ]);

    return paginate(data, total, page, limit);
  }

  async findForJob(userId: string, jobId: string, proposalId: string) {
    const job = await this.getOwnJob(userId, jobId);
    const proposal = await this.proposalsRepository.findById(proposalId);

    // Checked against the requirement in the path, not merely against
    // ownership: without this, a client could read any proposal on the
    // platform by pairing it with a requirement they happen to own.
    if (!proposal || proposal.jobId !== job.id) {
      throw new NotFoundException('Proposal not found on this requirement');
    }

    return this.proposalsRepository.findByIdForClient(proposal.id);
  }

  // ---------- attachments ----------

  async addAttachment(userId: string, proposalId: string, mediaId: string) {
    const { proposal } = await this.getOwnProposal(userId, proposalId);

    // A decided proposal is history. Adding a file to an offer the client
    // has already accepted or turned down changes what they decided on.
    if (proposal.status !== 'SUBMITTED') {
      throw new BadRequestException(
        `A ${proposal.status.toLowerCase()} proposal can no longer be changed`,
      );
    }

    // Both halves of the rule: the file is this user's, and it finished
    // uploading. Without the second, a proposal could carry a file that
    // never arrived.
    await this.mediaService.assertAttachable(userId, mediaId);

    const existing = await this.proposalsRepository.countAttachments(proposal.id);
    if (existing >= ProposalsService.MAX_ATTACHMENTS) {
      throw new BadRequestException(
        `A proposal can have at most ${ProposalsService.MAX_ATTACHMENTS} attachments`,
      );
    }

    // Marked private because of where it landed, not because the uploader
    // said so. See MediaService.markPrivate.
    await this.mediaService.markPrivate(mediaId);

    return this.proposalsRepository.addAttachment(proposal.id, mediaId, existing);
  }

  async removeAttachment(userId: string, proposalId: string, attachmentId: string): Promise<void> {
    const { proposal } = await this.getOwnProposal(userId, proposalId);

    const result = await this.proposalsRepository.removeAttachment(proposal.id, attachmentId);
    if (result.count === 0) {
      throw new NotFoundException('Attachment not found on this proposal');
    }
    // The Media row is deliberately left alone. The file belongs to the
    // user, not to this proposal, and they may want to attach it elsewhere.
  }

  /**
   * A proposal's attachments, with signed URLs.
   *
   * Readable by either party — the provider who attached them and the client
   * deciding on them. Nobody else, and never from a public route: these are
   * working material between two people.
   */
  async listAttachments(userId: string, proposalId: string) {
    const { proposal } = await this.getProposalAsParty(userId, proposalId);

    const attachments = await this.proposalsRepository.listAttachments(proposal.id);

    return Promise.all(
      // media is dropped rather than spread: objectKey is the storage path
      // and no client needs it.
      attachments.map(async ({ media, ...attachment }) => ({
        ...attachment,
        fileName: media?.originalFileName ?? null,
        mimeType: media?.mimeType ?? null,
        url: await this.mediaService.signViewUrl(media),
      })),
    );
  }

  // ---------- helpers ----------

  // Resolves a Profile to the User behind it and fires the given
  // notification at them. A profile with no resolvable user (shouldn't
  // happen — Profile.userId is a required FK) is skipped rather than
  // thrown on: a missing recipient is not a reason to fail the business
  // operation that already succeeded.
  private async notifyRecipient(
    profileId: string,
    notify: (recipientUserId: string) => Promise<void>,
  ): Promise<void> {
    const recipientUserId = await this.profilesRepository.findUserIdById(profileId);
    if (recipientUserId) {
      await notify(recipientUserId);
    }
  }

  /**
   * The single definition of "this requirement is accepting proposals".
   *
   * Deliberately not applied to accepting or rejecting: the deadline gates
   * providers submitting, not the client deciding. A client who takes a week
   * over a shortlist should not silently lose it.
   */
  private assertAcceptingProposals(job: Job): void {
    // deletedAt is not checked here: job always comes from
    // JobsRepository.findById, which already filters deletedAt out, so a
    // soft-deleted job can never reach this method.
    if (job.status !== 'PUBLISHED') {
      throw new ConflictException('This requirement is not accepting proposals');
    }

    if (job.proposalDeadline !== null && job.proposalDeadline.getTime() < Date.now()) {
      throw new ConflictException('The deadline for proposals on this requirement has passed');
    }
  }

  private async assertNoExistingProposal(jobId: string, providerProfileId: string): Promise<void> {
    const existing = await this.proposalsRepository.findByJobAndProvider(jobId, providerProfileId);
    if (!existing) return;

    // Named rather than reported as a generic duplicate. A provider who can
    // plainly see they withdrew, being told they already have a proposal,
    // reads that as a bug — and it is final, so they need to know why.
    if (existing.status === 'WITHDRAWN') {
      throw new ConflictException(
        'You withdrew your proposal on this requirement, and withdrawal is final',
      );
    }

    throw new ConflictException('You have already proposed on this requirement');
  }

  private async decidedMessage(proposalId: string): Promise<string> {
    const current = await this.proposalsRepository.findById(proposalId);
    return `This proposal has already been ${current?.status.toLowerCase() ?? 'decided'}`;
  }

  private async getOwnProfile(userId: string) {
    return getOwnProfileOrThrow(this.profilesRepository, userId);
  }

  /**
   * The provider-side ownership gate. Every provider mutation goes through
   * it.
   *
   * 403 rather than 404 for someone else's proposal, matching assertOwnership
   * and JobsService.getOwnJob. The 404-to-hide rule is for public routes,
   * where a hidden row must be indistinguishable from a missing one — no
   * proposal route is public, so there is nothing to hide from an anonymous
   * caller.
   */
  private async getOwnProposal(userId: string, proposalId: string) {
    const profile = await this.getOwnProfile(userId);
    const proposal = await this.proposalsRepository.findById(proposalId);

    if (!proposal) {
      throw new NotFoundException('Proposal not found');
    }
    if (proposal.providerProfileId !== profile.id) {
      throw new ForbiddenException('You do not have access to this proposal');
    }

    return { proposal, profile };
  }

  // JobsService already owns this exact ownership check (used by its own
  // writes); delegating rather than re-implementing it against
  // JobsRepository keeps "does this client own this requirement" defined
  // once.
  private async getOwnJob(userId: string, jobId: string) {
    const { job } = await this.jobsService.getOwnJob(userId, jobId);
    return job;
  }

  /**
   * The client-side gate: the caller owns the requirement this proposal was
   * made against.
   *
   * Checking `role === CLIENT` would not do — that would let any client
   * decide any requirement. Ownership of the job is the authorization, and
   * it also makes the role check redundant: only a client can own one.
   */
  private async getProposalOnOwnJob(userId: string, proposalId: string) {
    const profile = await this.getOwnProfile(userId);
    const proposal = await this.proposalsRepository.findById(proposalId);

    if (!proposal) {
      throw new NotFoundException('Proposal not found');
    }

    const job = await this.jobsRepository.findById(proposal.jobId);
    if (!job || job.clientProfileId !== profile.id) {
      throw new ForbiddenException('You do not have access to this proposal');
    }

    // A direct contract's "proposal" represents the client's own offer to a
    // specific provider (DirectContractsService) — the client authored it,
    // so accepting or rejecting it here would let them decide their own
    // offer for the provider, skipping the consent the provider is supposed
    // to give. That decision belongs to DirectContractsService.accept/decline
    // instead, gated on the provider's ownership of the proposal, not the
    // client's ownership of the job.
    if (job.isDirect) {
      throw new ForbiddenException(
        'A direct contract offer is accepted or declined by the provider, not the client',
      );
    }

    return { proposal, job, profile };
  }

  // Either party to a proposal: the provider who wrote it, or the client who
  // received it. Used by the reads both sides need.
  private async getProposalAsParty(userId: string, proposalId: string) {
    const profile = await this.getOwnProfile(userId);
    const proposal = await this.proposalsRepository.findById(proposalId);

    if (!proposal) {
      throw new NotFoundException('Proposal not found');
    }

    if (proposal.providerProfileId !== profile.id) {
      const job = await this.jobsRepository.findById(proposal.jobId);
      if (!job || job.clientProfileId !== profile.id) {
        throw new ForbiddenException('You do not have access to this proposal');
      }
    }

    return { proposal, profile };
  }
}
