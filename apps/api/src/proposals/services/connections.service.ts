import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ProfilesRepository } from '../../profiles/repositories/profiles.repository';
import { JobsRepository } from '../../jobs/repositories/jobs.repository';
import { assertProviderRole, getOwnProfileOrThrow } from '../../profiles/profile-access.util';
import { paginate } from '../../marketplace/pagination';
import { ConnectionsRepository } from '../repositories/connections.repository';
import { ProposalsRepository } from '../repositories/proposals.repository';
import type { PaginationQueryDto } from '../../profiles/dto/pagination-query.dto';

// One date on the provider's availability calendar. CONFIRMED always wins
// over PENDING for the same date — a hired date is real regardless of
// whatever else was proposed for that day.
export interface CalendarEntry {
  date: string;
  status: 'PENDING' | 'CONFIRMED';
  jobId: string;
  jobTitle: string;
}

/**
 * Reads, plus the one write that moves a connection's own lifecycle:
 * confirmComplete.
 *
 * There is still no create method here, and that is the design rather than
 * an omission: a connection is written inside the acceptance transaction in
 * ProposalsService, because it must never exist without the accepted
 * proposal and filled requirement that produced it. A service method that
 * could create one on its own would be a way to manufacture a hiring
 * relationship that nobody agreed to.
 *
 * ACTIVE -> COMPLETED is the only transition that exists (module5-completion.md)
 * — either the client confirms, or listMine/findById's sweep auto-completes a
 * connection whose event happened long enough ago that a stalled
 * confirmation shouldn't keep blocking Reviews. No close, cancel, or any
 * other status.
 */
@Injectable()
export class ConnectionsService {
  constructor(
    private readonly connectionsRepository: ConnectionsRepository,
    private readonly proposalsRepository: ProposalsRepository,
    private readonly profilesRepository: ProfilesRepository,
    private readonly jobsRepository: JobsRepository,
  ) {}

  async listMine(userId: string, pagination: PaginationQueryDto) {
    const profile = await this.getOwnProfile(userId);
    await this.connectionsRepository.sweepAutoComplete();
    const { page, limit } = pagination;

    // One query for both roles. A client's connections and a provider's are
    // the same rows read from opposite sides, so two endpoints would be two
    // names for one list — and the caller's role already tells the frontend
    // which side of each row is "them".
    const [data, total] = await Promise.all([
      this.connectionsRepository.listByProfile(profile.id, (page - 1) * limit, limit),
      this.connectionsRepository.countByProfile(profile.id),
    ]);

    return paginate(data, total, page, limit);
  }

  async findById(userId: string, connectionId: string) {
    const profile = await this.getOwnProfile(userId);
    await this.connectionsRepository.sweepAutoComplete();
    const connection = await this.connectionsRepository.findById(connectionId);

    if (!connection) {
      throw new NotFoundException('Connection not found');
    }

    const isParty =
      connection.clientProfileId === profile.id || connection.providerProfileId === profile.id;
    if (!isParty) {
      throw new ForbiddenException('You do not have access to this connection');
    }

    // Both roles a Connection can be read by are always entitled to the
    // exact location: the client is the Job's owner, the provider exists on
    // this row only because they were hired for it (a Connection is created
    // exclusively inside ProposalsService.accept/DirectContractsService.accept).
    // Fetched separately rather than added to CONNECTION_FIELDS, same reason
    // as every other call site in this slice.
    const locationExact = await this.jobsRepository.findLocationExact(connection.job.id);

    // Otherwise returned whole. The two ownership ids read for the check
    // above are already on the row as `clientProfile.id` and
    // `providerProfile.id`, so stripping them would hide nothing and cost a
    // rebuild of the object.
    return { ...connection, job: { ...connection.job, locationExact } };
  }

  /**
   * The client confirms the connection complete. Only the client — the
   * provider has nothing to gate on here, since nothing downstream depends
   * on a provider-side step (no escrow, no payout; see
   * module5-completion.md). Idempotent, same convention as
   * NotificationsService.markAsRead: confirming an already-completed
   * connection (including one the sweep already closed) just returns it
   * unchanged rather than erroring.
   */
  async confirmComplete(userId: string, connectionId: string) {
    const profile = await this.getOwnProfile(userId);
    // Same as findById/listMine — a connection whose grace period already
    // lapsed should read as COMPLETED here too, not just on the read paths.
    await this.connectionsRepository.sweepAutoComplete();
    const connection = await this.connectionsRepository.findById(connectionId);

    if (!connection) {
      throw new NotFoundException('Connection not found');
    }
    if (connection.clientProfileId !== profile.id) {
      const isProvider = connection.providerProfileId === profile.id;
      throw new ForbiddenException(
        isProvider
          ? 'Only the client can confirm a connection complete'
          : 'You do not have access to this connection',
      );
    }
    if (connection.status === 'COMPLETED') {
      return connection;
    }

    // Not a >= against "now the moment of the request" — the event's own
    // day must have fully passed, matching the sweep's own definition of
    // "the event happened".
    if (!connection.job.eventDate || connection.job.eventDate.getTime() > Date.now()) {
      throw new ConflictException('Cannot confirm complete before the event date');
    }

    // markCompleted's own count is discarded: whether this call won the race
    // against a concurrent sweep or lost it, the connection is COMPLETED
    // either way, and the re-read below returns the row as it actually
    // stands — not a stale pre-write copy, and not this call's write if
    // another one already landed first.
    await this.connectionsRepository.markCompleted(connectionId);
    return (await this.connectionsRepository.findById(connectionId))!;
  }

  /**
   * The provider's own availability calendar: every date they are either
   * waiting to hear back on (a SUBMITTED proposal) or already booked for
   * (an ACTIVE connection). Provider-only — a client's own requirements
   * already list their dates, and don't need a second view.
   *
   * A date can appear from both a pending proposal and a confirmed
   * connection at once (e.g. two proposals on different jobs landing on the
   * same day); CONFIRMED wins, since that is the one that actually blocks
   * the day.
   */
  async myCalendar(userId: string): Promise<CalendarEntry[]> {
    const profile = await this.getOwnProfile(userId);
    assertProviderRole(profile.user);
    await this.connectionsRepository.sweepAutoComplete();

    const [pending, confirmed] = await Promise.all([
      this.proposalsRepository.listSubmittedDatesForProvider(profile.id),
      this.connectionsRepository.listActiveDatesForProvider(profile.id),
    ]);

    const byDate = new Map<string, CalendarEntry>();
    for (const { job } of pending) {
      if (!job.eventDate) continue;
      const date = job.eventDate.toISOString().slice(0, 10);
      byDate.set(date, { date, status: 'PENDING', jobId: job.id, jobTitle: job.title });
    }
    for (const { job } of confirmed) {
      if (!job.eventDate) continue;
      const date = job.eventDate.toISOString().slice(0, 10);
      byDate.set(date, { date, status: 'CONFIRMED', jobId: job.id, jobTitle: job.title });
    }

    return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  }

  private async getOwnProfile(userId: string) {
    return getOwnProfileOrThrow(this.profilesRepository, userId);
  }
}
