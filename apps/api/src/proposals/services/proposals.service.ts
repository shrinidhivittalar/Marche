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
import { assertProviderRole } from '../../profiles/profile-access.util';
import { paginate } from '../../marketplace/pagination';
import { ProposalsRepository } from '../repositories/proposals.repository';
import { ConnectionsRepository } from '../repositories/connections.repository';
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
    private readonly profilesRepository: ProfilesRepository,
    private readonly jobsRepository: JobsRepository,
    private readonly jobsService: JobsService,
    private readonly mediaService: MediaService,
    private readonly prisma: PrismaService,
  ) {}

  // ---------- provider-owned writes ----------

  async submit(userId: string, dto: CreateProposalDto): Promise<Proposal> {
    const profile = await this.getOwnProfile(userId);
    // Re-read at submission rather than trusted from an earlier check: a
    // provider can be suspended or have their role changed between opening
    // the form and sending it, and this is the moment an offer becomes real.
    assertProviderRole(profile.user.role);

    const job = await this.jobsRepository.findById(dto.jobId);
    if (!job) {
      throw new NotFoundException('Requirement not found');
    }

    // Ownership before eligibility: "you cannot propose on your own
    // requirement" is a clearer answer than "this requirement is not
    // accepting proposals", which is what a client-owned draft would
    // otherwise return.
    if (job.clientProfileId === profile.id) {
      throw new ForbiddenException('You cannot propose on your own requirement');
    }

    this.assertAcceptingProposals(job);
    await this.assertNoExistingProposal(job.id, profile.id);

    try {
      // Fields are enumerated rather than spread. The DTO already cannot
      // carry providerProfileId or status past the ValidationPipe, but
      // listing them means a field added to the DTO later reaches the
      // database only when someone adds it here deliberately.
      return await this.proposalsRepository.create({
        jobId: job.id,
        providerProfileId: profile.id,
        coverMessage: dto.coverMessage,
        proposedPrice: dto.proposedPrice,
        deliveryDays: dto.deliveryDays,
      });
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

    return this.prisma.client.$transaction(async (tx) => {
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
    });
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

    return proposal.providerProfileId === profile.id
      ? this.proposalsRepository.findByIdForProvider(proposal.id)
      : this.proposalsRepository.findByIdForClient(proposal.id);
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

  /**
   * The single definition of "this requirement is accepting proposals".
   *
   * Deliberately not applied to accepting or rejecting: the deadline gates
   * providers submitting, not the client deciding. A client who takes a week
   * over a shortlist should not silently lose it.
   */
  private assertAcceptingProposals(job: Job): void {
    if (job.deletedAt !== null || job.status !== 'PUBLISHED') {
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
    const profile = await this.profilesRepository.findByUserId(userId);
    if (!profile) {
      throw new NotFoundException('Profile not found');
    }
    return profile;
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

  private async getOwnJob(userId: string, jobId: string) {
    const profile = await this.getOwnProfile(userId);
    const job = await this.jobsRepository.findById(jobId);

    if (!job) {
      throw new NotFoundException('Requirement not found');
    }
    if (job.clientProfileId !== profile.id) {
      throw new ForbiddenException('You do not have access to this requirement');
    }

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
