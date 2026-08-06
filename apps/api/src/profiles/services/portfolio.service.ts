import { Injectable, NotFoundException } from '@nestjs/common';
import { ProfilesRepository } from '../repositories/profiles.repository';
import { PortfolioRepository } from '../repositories/portfolio.repository';
import { assertOwnership, assertProviderRole } from '../profile-access.util';
import type { CreatePortfolioDto, UpdatePortfolioDto } from '../dto/portfolio.dto';
import type { Portfolio } from '@marche/db';

@Injectable()
export class PortfolioService {
  constructor(
    private readonly profilesRepository: ProfilesRepository,
    private readonly portfolioRepository: PortfolioRepository,
  ) {}

  async create(userId: string, dto: CreatePortfolioDto): Promise<Portfolio> {
    const profile = await this.getOwnProfile(userId);
    assertProviderRole(profile.user.role);

    return this.portfolioRepository.create({
      profileId: profile.id,
      title: dto.title,
      description: dto.description,
      category: dto.category,
      coverImage: dto.coverImage,
      projectDate: dto.projectDate ? new Date(dto.projectDate) : undefined,
      imageUrls: dto.imageUrls,
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
