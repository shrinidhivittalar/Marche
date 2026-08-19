import { Injectable } from '@nestjs/common';
import { ConnectionsService } from '../../proposals/services/connections.service';
import { ProfilesRepository } from '../../profiles/repositories/profiles.repository';
import { getOwnProfileOrThrow } from '../../profiles/profile-access.util';
import { paginate, type Paginated } from '../../marketplace/pagination';
import {
  WorkDiaryRepository,
  type WorkDiaryEntryWithContext,
} from '../repositories/work-diary.repository';
import type { PaginationQueryDto } from '../../profiles/dto/pagination-query.dto';
import type { WorkDiaryEntry } from '@marche/db';

@Injectable()
export class WorkDiaryService {
  constructor(
    private readonly workDiaryRepository: WorkDiaryRepository,
    private readonly connectionsService: ConnectionsService,
    private readonly profilesRepository: ProfilesRepository,
  ) {}

  /** Either party on the connection may add an entry. */
  async addEntry(userId: string, connectionId: string, note: string): Promise<WorkDiaryEntry> {
    await this.connectionsService.findById(userId, connectionId); // party check
    return this.workDiaryRepository.create(connectionId, userId, note);
  }

  /** Either party on the connection may read its log. */
  async listForConnection(
    userId: string,
    connectionId: string,
  ): Promise<WorkDiaryEntryWithContext[]> {
    await this.connectionsService.findById(userId, connectionId); // party check
    return this.workDiaryRepository.listForConnection(connectionId);
  }

  /**
   * The caller's own aggregate log — every entry on every connection they
   * are a party to, from either side. Backs the Work Diary tab/page the
   * same way payments.service.ts's listMine backs Finances.
   */
  async listMine(
    userId: string,
    pagination: PaginationQueryDto,
  ): Promise<Paginated<WorkDiaryEntryWithContext>> {
    const profile = await getOwnProfileOrThrow(this.profilesRepository, userId);
    const { page, limit } = pagination;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.workDiaryRepository.listForProfile(profile.id, skip, limit),
      this.workDiaryRepository.countForProfile(profile.id),
    ]);

    return paginate(data, total, page, limit);
  }
}
