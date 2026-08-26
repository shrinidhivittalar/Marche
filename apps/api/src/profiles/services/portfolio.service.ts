import { Injectable, NotFoundException } from '@nestjs/common';
import { ProfilesRepository } from '../repositories/profiles.repository';
import { PortfolioRepository } from '../repositories/portfolio.repository';
import { MediaService } from '../../media/media.service';
import { assertOwnership, assertProviderRole } from '../profile-access.util';
import type { CreatePortfolioDto, UpdatePortfolioDto } from '../dto/portfolio.dto';
import type { Portfolio } from '@marche/db';

@Injectable()
export class PortfolioService {
  constructor(
    private readonly profilesRepository: ProfilesRepository,
    private readonly portfolioRepository: PortfolioRepository,
    private readonly mediaService: MediaService,
  ) {}

  async create(userId: string, dto: CreatePortfolioDto): Promise<Portfolio> {
    const profile = await this.getOwnProfile(userId);
    assertProviderRole(profile.user);

    // Every file is checked before anything is written. assertAttachable
    // enforces both halves of the rule: the file belongs to this user, and
    // it actually finished uploading. Without the first, one provider could
    // put another's photo on their portfolio; without the second, a piece
    // could reference a file that never arrived and render permanently
    // broken on a public profile.
    await Promise.all(dto.mediaIds.map((id) => this.mediaService.assertAttachable(userId, id)));

    return this.portfolioRepository.create({
      profileId: profile.id,
      title: dto.title,
      description: dto.description,
      category: dto.category,
      coverImage: dto.coverImage,
      projectDate: dto.projectDate ? new Date(dto.projectDate) : undefined,
      mediaIds: dto.mediaIds,
    });
  }

  async update(userId: string, portfolioId: string, dto: UpdatePortfolioDto): Promise<Portfolio> {
    const profile = await this.getOwnProfile(userId);
    const item = await this.portfolioRepository.findById(portfolioId);
    if (!item) {
      throw new NotFoundException('Portfolio item not found');
    }
    assertOwnership(item.profileId, profile.id);

    return this.portfolioRepository.update(portfolioId, {
      title: dto.title,
      description: dto.description,
      category: dto.category,
      coverImage: dto.coverImage,
      projectDate: dto.projectDate ? new Date(dto.projectDate) : undefined,
      visibility: dto.visibility,
    });
  }

  async remove(userId: string, portfolioId: string): Promise<void> {
    const profile = await this.getOwnProfile(userId);
    const item = await this.portfolioRepository.findById(portfolioId);
    if (!item) {
      throw new NotFoundException('Portfolio item not found');
    }
    assertOwnership(item.profileId, profile.id);

    // Soft delete — a completed contract that referenced this item must
    // never break because the item is gone. See module2-edge-cases.md.
    await this.portfolioRepository.softDelete(portfolioId);
  }

  private async getOwnProfile(userId: string) {
    const profile = await this.profilesRepository.findByUserId(userId);
    if (!profile) {
      throw new NotFoundException('Profile not found');
    }
    return profile;
  }
}
