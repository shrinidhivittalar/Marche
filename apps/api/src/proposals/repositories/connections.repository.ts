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
    select: { id: true, title: true, status: true, eventDate: true, location: true },
  },
  proposal: {
    select: { id: true, proposedPrice: true, deliveryDays: true, submittedAt: true },
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

  // Client confirmation, or the sweep below — either is "complete" the same
  // way, so both call this rather than each writing the row independently.
  markCompleted(id: string) {
    return this.prisma.client.connection.update({
      where: { id },
      data: { status: 'COMPLETED', completedAt: new Date() },
      select: CONNECTION_FIELDS,
    });
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
}
