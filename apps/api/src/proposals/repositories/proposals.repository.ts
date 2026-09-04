import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { Prisma, Proposal, ProposalStatus } from '@marche/db';

// Which timestamp each end state stamps. A map rather than a branch in the
// transition method, so adding a state means adding a line here and the
// compiler naming every place that must follow.
const DECIDED_AT: Record<Exclude<ProposalStatus, 'SUBMITTED'>, keyof Prisma.ProposalUpdateInput> = {
  ACCEPTED: 'acceptedAt',
  REJECTED: 'rejectedAt',
  WITHDRAWN: 'withdrawnAt',
};

// What the client sees when reviewing proposals on their own requirement.
// The provider's identity is the point of the join: a cover message and a
// price mean nothing without knowing who is offering them.
//
// Declared once so the list and the single read cannot drift apart.
const PROPOSAL_FIELDS = {
  id: true,
  coverMessage: true,
  proposedPrice: true,
  // Negotiated final figure, if the two parties agreed on one via
  // /price-negotiations before hiring — never displayed/charged without
  // falling back to proposedPrice first (agreedPrice ?? proposedPrice),
  // same convention as ConnectionsRepository's own select.
  agreedPrice: true,
  agreedPriceAt: true,
  deliveryDays: true,
  status: true,
  submittedAt: true,
  acceptedAt: true,
  rejectedAt: true,
  withdrawnAt: true,
  providerProfile: {
    select: {
      id: true,
      username: true,
      displayName: true,
      headline: true,
      location: true,
      verifiedAt: true,
      avatarMediaId: true,
    },
  },
} satisfies Prisma.ProposalSelect;

// What a provider sees on their own proposal. Same fields, plus the
// requirement it targets — a provider's list is useless without knowing what
// each offer was for — and minus their own profile, which they already know.
const OWN_PROPOSAL_FIELDS = {
  id: true,
  coverMessage: true,
  proposedPrice: true,
  // Negotiated final figure, if the two parties agreed on one via
  // /price-negotiations before hiring — never displayed/charged without
  // falling back to proposedPrice first (agreedPrice ?? proposedPrice),
  // same convention as ConnectionsRepository's own select.
  agreedPrice: true,
  agreedPriceAt: true,
  deliveryDays: true,
  status: true,
  submittedAt: true,
  acceptedAt: true,
  rejectedAt: true,
  withdrawnAt: true,
  // When and where, not just what. A provider looking at their own
  // proposals is deciding whether they can be somewhere on a date — a title
  // and a price do not answer that, and making them open each requirement
  // to find out is a round trip for the one fact they came for.
  job: {
    select: {
      id: true,
      title: true,
      status: true,
      eventDate: true,
      eventStartTime: true,
      eventEndTime: true,
      // Coarse only. locationExact is merged in by ProposalsService.findById
      // — only for the provider branch, and only once
      // JobsRepository.findHiredProviderProfileId confirms this caller is
      // the one who was hired — never here.
      locationCoarse: true,
      serviceMode: true,
      proposalDeadline: true,
      // Lets the provider's proposal-detail screen tell a direct contract
      // offer (DirectContractsService) apart from an ordinary proposal they
      // submitted themselves — the two need different actions (accept/decline
      // vs. withdraw) on what is otherwise the same Proposal row.
      isDirect: true,
      clientProfile: { select: { id: true, username: true, displayName: true } },
    },
  },
} satisfies Prisma.ProposalSelect;

@Injectable()
export class ProposalsRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ---------- reads for authorization and lifecycle ----------

  // The bare row, deliberately: callers are the ownership and transition
  // checks, which need jobId, providerProfileId and status — not the
  // provider's display name.
  findById(id: string) {
    return this.prisma.client.proposal.findUnique({ where: { id } });
  }

  // The duplicate pre-check. The unique constraint is what actually holds
  // under concurrency; this exists so the common, sequential case gets a
  // message that names what happened — including whether the provider had
  // already withdrawn, which is final and reads as a bug if reported as a
  // plain duplicate.
  findByJobAndProvider(jobId: string, providerProfileId: string) {
    return this.prisma.client.proposal.findUnique({
      where: { jobId_providerProfileId: { jobId, providerProfileId } },
    });
  }

  // ---------- reads for people ----------

  findByIdForClient(id: string) {
    return this.prisma.client.proposal.findUnique({
      where: { id },
      select: PROPOSAL_FIELDS,
    });
  }

  findByIdForProvider(id: string) {
    return this.prisma.client.proposal.findUnique({
      where: { id },
      select: OWN_PROPOSAL_FIELDS,
    });
  }

  // Every proposal on one requirement, for its owner. Withdrawn ones are
  // included rather than filtered: a proposal the client has already read
  // must not vanish mid-review, it must show as withdrawn.
  listByJob(jobId: string, skip: number, take: number) {
    return this.prisma.client.proposal.findMany({
      where: { jobId },
      // Newest first, with id as a tiebreaker so the order is total. Without
      // it Postgres may return two same-instant rows in a different order
      // per request, and a proposal can duplicate or vanish across pages.
      orderBy: [{ submittedAt: 'desc' }, { id: 'asc' }],
      skip,
      take,
      select: PROPOSAL_FIELDS,
    });
  }

  countByJob(jobId: string) {
    return this.prisma.client.proposal.count({ where: { jobId } });
  }

  listByProvider(providerProfileId: string, skip: number, take: number) {
    return this.prisma.client.proposal.findMany({
      where: { providerProfileId },
      orderBy: [{ submittedAt: 'desc' }, { id: 'asc' }],
      skip,
      take,
      select: OWN_PROPOSAL_FIELDS,
    });
  }

  countByProvider(providerProfileId: string) {
    return this.prisma.client.proposal.count({ where: { providerProfileId } });
  }

  // Dates a provider is waiting on, for the availability calendar: every
  // still-open proposal with an event date, regardless of age. Deliberately
  // narrow — the calendar only needs the date, not the full offer.
  listSubmittedDatesForProvider(providerProfileId: string) {
    return this.prisma.client.proposal.findMany({
      where: { providerProfileId, status: 'SUBMITTED', job: { eventDate: { not: null } } },
      select: {
        id: true,
        job: { select: { id: true, title: true, eventDate: true } },
      },
    });
  }

  // ---------- writes ----------

  create(data: Prisma.ProposalUncheckedCreateInput): Promise<Proposal> {
    return this.prisma.client.proposal.create({ data });
  }

  /**
   * Moves one proposal out of SUBMITTED, but only if it is still there.
   *
   * `updateMany` rather than `update`, for the same reason
   * JobsRepository.claimFilled uses it: the status test travels inside the
   * UPDATE, so a client accepting while the provider withdraws — or accepting
   * and rejecting at once — is serialised by Postgres on the row. The loser
   * matches zero rows instead of overwriting the winner's decision, which is
   * how a proposal would otherwise end up both ACCEPTED and WITHDRAWN.
   *
   * Takes a client so acceptance can pass its transaction; withdrawal and
   * rejection pass the ordinary one, being single writes.
   *
   * Returns the number of rows moved: 1 for the winner, 0 for everyone else.
   */
  transitionFromSubmitted(
    client: Prisma.TransactionClient,
    id: string,
    to: Exclude<ProposalStatus, 'SUBMITTED'>,
  ): Promise<number> {
    return client.proposal
      .updateMany({
        where: { id, status: 'SUBMITTED' },
        data: { status: to, [DECIDED_AT[to]]: new Date() },
      })
      .then((result) => result.count);
  }

  /**
   * Rejects every other proposal still in play on a requirement.
   *
   * Runs inside the acceptance transaction. Without it, a filled requirement
   * would leave its losing proposals sitting at SUBMITTED, which reads to
   * those providers as though they are still in the running.
   */
  rejectCompeting(
    client: Prisma.TransactionClient,
    jobId: string,
    exceptProposalId: string,
  ): Promise<number> {
    return client.proposal
      .updateMany({
        where: { jobId, status: 'SUBMITTED', id: { not: exceptProposalId } },
        data: { status: 'REJECTED', rejectedAt: new Date() },
      })
      .then((result) => result.count);
  }

  // The ordinary Prisma client, for the two decisions that are a single
  // write. Exposed as its own method rather than making every caller reach
  // through `prisma.client`.
  get client(): Prisma.TransactionClient {
    return this.prisma.client;
  }

  // ---------- attachments ----------

  listAttachments(proposalId: string) {
    return this.prisma.client.proposalAttachment.findMany({
      where: { proposalId },
      orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        displayOrder: true,
        mediaId: true,
        media: {
          select: { objectKey: true, status: true, originalFileName: true, mimeType: true },
        },
      },
    });
  }

  addAttachment(proposalId: string, mediaId: string, displayOrder: number) {
    return this.prisma.client.proposalAttachment.create({
      data: { proposalId, mediaId, displayOrder },
    });
  }

  removeAttachment(proposalId: string, attachmentId: string) {
    // Scoped by proposalId as well as attachmentId: checking the attachment
    // id alone would let any provider detach any other proposal's file.
    return this.prisma.client.proposalAttachment.deleteMany({
      where: { id: attachmentId, proposalId },
    });
  }

  countAttachments(proposalId: string) {
    return this.prisma.client.proposalAttachment.count({ where: { proposalId } });
  }
}
