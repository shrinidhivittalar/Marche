import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { Prisma } from '@marche/db';

// Both sides of the relationship, plus the offer it was struck on. A
// connection is read by two different people who need the same thing from
// it — who the other party is, and what was agreed — so there is one shape
// rather than a client view and a provider view.
const CONNECTION_FIELDS = {
  id: true,
  status: true,
  completedAt: true,
  createdAt: true,
  job: {
    select: {
      id: true,
      title: true,
      status: true,
      eventDate: true,
      // Coarse only. locationExact is merged in by ConnectionsService.findById
      // after its own isParty check — both roles a Connection can be read by
      // (the client who owns the Job, the provider it was created for) are
      // always entitled to it, but it is never selected here.
      locationCoarse: true,
      serviceMode: true,
      // Lets a caller distinguish a direct contract from a marketplace hire
      // (see DirectContractsService) — the provider Contracts page's Direct
      // Contracts tab filters on this rather than needing a second endpoint.
      isDirect: true,
    },
  },
  proposal: {
    // agreedPrice is the negotiated final figure, if the two parties agreed
    // to one (PriceNegotiationsService) — null otherwise. proposedPrice
    // stays the original, immutable snapshot regardless. Consumers reading
    // "what was agreed" (Payments today) should read
    // proposal.agreedPrice ?? proposal.proposedPrice, never proposedPrice
    // alone.
    select: {
      id: true,
      proposedPrice: true,
      agreedPrice: true,
      agreedPriceAt: true,
      deliveryDays: true,
      submittedAt: true,
    },
  },
  clientProfile: {
    select: { id: true, username: true, displayName: true, location: true, avatarMediaId: true },
  },
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
} satisfies Prisma.ConnectionSelect;

// A profile sits on one side or the other, never both — a provider cannot
// propose on their own requirement. Declared once so the list, the count and
// the single read all agree on what "mine" means.
function ownedBy(profileId: string): Prisma.ConnectionWhereInput {
  return { OR: [{ clientProfileId: profileId }, { providerProfileId: profileId }] };
}

// The event already happened and enough time passed that a client who was
// going to confirm would have by now — see module5-completion.md. Anchored
// to the event date, not to any provider action: nothing downstream (no
// escrow, no payout) depends on the provider having done anything, so there
// is nothing for a provider-side step to gate.
const AUTO_COMPLETE_GRACE_DAYS = 3;

@Injectable()
export class ConnectionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Creates the relationship. Transaction client only — deliberately, and
   * there is no non-transactional overload.
   *
   * A connection is meaningless on its own: it exists because a proposal was
   * accepted and a requirement was filled, and it must never exist without
   * both. The signature is what makes creating one outside that transaction
   * impossible rather than merely discouraged, which is the same reason no
   * POST route exists.
   */
  create(client: Prisma.TransactionClient, data: Prisma.ConnectionUncheckedCreateInput) {
    return client.connection.create({ data, select: CONNECTION_FIELDS });
  }

  findById(id: string) {
    return this.prisma.client.connection.findUnique({
      where: { id },
      select: { ...CONNECTION_FIELDS, clientProfileId: true, providerProfileId: true },
    });
  }

  listByProfile(profileId: string, skip: number, take: number) {
    return this.prisma.client.connection.findMany({
      where: ownedBy(profileId),
      // Newest first, with id as a tiebreaker so the order is total across
      // pages. Same rule as every other list in the codebase.
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      skip,
      take,
      select: CONNECTION_FIELDS,
    });
  }

  countByProfile(profileId: string) {
    return this.prisma.client.connection.count({ where: ownedBy(profileId) });
  }

  // "Completed projects" for a profile's public statistics (either side of
  // the connection counts — a client's completed hires and a provider's
  // completed jobs are both "projects" from that profile's own perspective).
  // A single COUNT, same shape as countByProfile above, filtered to
  // COMPLETED — the only status that means the work actually happened.
  countCompletedByProfile(profileId: string) {
    return this.prisma.client.connection.count({
      where: { ...ownedBy(profileId), status: 'COMPLETED' },
    });
  }

  // Dates already committed, for the availability calendar: every active
  // connection with an event date. COMPLETED ones are history, not a future
  // slot to guard, so they're excluded.
  listActiveDatesForProvider(providerProfileId: string) {
    return this.prisma.client.connection.findMany({
      where: { providerProfileId, status: 'ACTIVE', job: { eventDate: { not: null } } },
      select: {
        id: true,
        job: { select: { id: true, title: true, eventDate: true } },
      },
    });
  }

  // Called by ConnectionsService.confirmComplete (the client-confirmation
  // path). sweepAutoComplete below is the other way a connection completes,
  // but it writes the same shape directly via updateMany rather than calling
  // this — it flips a batch of rows in one query, which a single-row update
  // taking an id can't do.
  //
  // Conditional UPDATE, same reasoning as PaymentsRepository.markPaid: the
  // status check travels inside the UPDATE, so a sweep and a manual confirm
  // racing each other are serialised by Postgres on the row — the loser
  // matches zero rows instead of re-stamping completedAt to a later time
  // than when the connection actually completed. Returns the row count, not
  // the row; ConnectionsService re-reads either way, since a 0 here still
  // means "COMPLETED now", just written by the other caller.
  async markCompleted(id: string): Promise<number> {
    const result = await this.prisma.client.connection.updateMany({
      where: { id, status: 'ACTIVE' },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });
    return result.count;
  }

  // Flips every ACTIVE connection whose event happened more than the grace
  // period ago. Called before any read that returns connection status
  // (ConnectionsService.findById / listMine), so status is always correct by
  // the time a caller sees it — the substitute for a cron job this app has
  // no infrastructure for yet.
  async sweepAutoComplete(): Promise<void> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - AUTO_COMPLETE_GRACE_DAYS);
    await this.prisma.client.connection.updateMany({
      where: { status: 'ACTIVE', job: { eventDate: { lt: cutoff } } },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });
  }

  // Unpaginated, ids only — for MessagesService, which needs every
  // connection a profile is party to in order to build the conversation
  // list preview, not one page of the "Connections" screen's own listing.
  async listIdsByProfile(profileId: string): Promise<string[]> {
    const connections = await this.prisma.client.connection.findMany({
      where: ownedBy(profileId),
      select: { id: true },
    });
    return connections.map((connection) => connection.id);
  }
}
