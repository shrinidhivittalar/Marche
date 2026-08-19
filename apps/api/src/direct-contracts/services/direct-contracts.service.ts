import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ProfilesRepository } from '../../profiles/repositories/profiles.repository';
import { CategoriesRepository } from '../../marketplace/repositories/categories.repository';
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
// is a real Connection when it's done, so Payments/Reviews/Disputes/Work
// Diary all work on it unchanged. What's different is only how it's made:
// no public listing, no competing proposals, one transaction instead of a
// discover-then-propose-then-accept sequence.
@Injectable()
export class DirectContractsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly profilesRepository: ProfilesRepository,
    private readonly categoriesRepository: CategoriesRepository,
    private readonly connectionsRepository: ConnectionsRepository,
    private readonly notificationsService: NotificationsService,
  ) {}

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

    // One transaction: the job, its (already-accepted) proposal, and the
    // connection all come into existence together or not at all — there is
    // no moment where a direct-contract job exists without the proposal
    // and connection that make it mean something, same invariant
    // ProposalsService.accept holds for the marketplace path.
    const connection = await this.prisma.client.$transaction(async (tx) => {
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
          // Skips DRAFT/PUBLISHED entirely — never listed, never
          // discoverable, so there is no open period for it to sit in.
          status: 'FILLED',
          publishedAt: new Date(),
          isDirect: true,
        },
      });

      const proposal = await tx.proposal.create({
        data: {
          jobId: job.id,
          providerProfileId: providerProfile.id,
          coverMessage: 'Direct contract, agreed outside the marketplace.',
          proposedPrice: dto.price,
          deliveryDays: dto.deliveryDays,
          status: 'ACCEPTED',
          submittedAt: new Date(),
          acceptedAt: new Date(),
        },
      });

      return this.connectionsRepository.create(tx, {
        jobId: job.id,
        proposalId: proposal.id,
        clientProfileId: clientProfile.id,
        providerProfileId: providerProfile.id,
      });
    });

    await this.notificationsService.connectionEstablished([clientUserId, providerProfile.userId], {
      connectionId: connection.id,
      jobId: connection.job.id,
      proposalId: connection.proposal.id,
    });

    return connection;
  }
}
