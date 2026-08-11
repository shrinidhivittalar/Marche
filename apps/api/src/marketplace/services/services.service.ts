import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ProfilesRepository } from '../../profiles/repositories/profiles.repository';
import { assertOwnership, assertProviderRole } from '../../profiles/profile-access.util';
import { CategoriesRepository } from '../repositories/categories.repository';
import { ServicesRepository, type ServiceSearchFilters } from '../repositories/services.repository';
import { CategoriesService } from './categories.service';
import { MediaService } from '../../media/media.service';
import { normalizeTags } from '../service-tags.util';
import { paginate, type Paginated } from '../pagination';
import type { CreateServiceDto, ServiceVisibilityDto, UpdateServiceDto } from '../dto/service.dto';
import type { SearchServicesDto } from '../dto/search-services.dto';
import type { PaginationQueryDto } from '../../profiles/dto/pagination-query.dto';
import type { Service } from '@marche/db';

// Named for the domain entity (a marketplace "Service"), not for Nest's
// notion of a service class. ServicesRepository follows the same naming.
@Injectable()
export class ServicesService {
  constructor(
    private readonly profilesRepository: ProfilesRepository,
    private readonly servicesRepository: ServicesRepository,
    private readonly categoriesRepository: CategoriesRepository,
    private readonly categoriesService: CategoriesService,
    private readonly mediaService: MediaService,
  ) {}

  // ---------- provider-owned writes ----------

  async create(userId: string, dto: CreateServiceDto): Promise<Service> {
    const profile = await this.getOwnProfile(userId);
    assertProviderRole(profile.user.role);

    await this.assertCategoryExists(dto.categoryId);
    await this.assertSkillsExist(dto.skillIds);

    // Fields are enumerated rather than spread. Even though the DTO cannot
    // carry profileId or status past the ValidationPipe, listing them out
    // means a future field added to the DTO reaches the database only when
    // someone adds it here deliberately. status and publishedAt are left to
    // their schema defaults (DRAFT / null) — a listing is never born live.
    const service = await this.servicesRepository.create({
      profileId: profile.id,
      categoryId: dto.categoryId,
      title: dto.title,
      description: dto.description,
      startingPrice: dto.startingPrice,
      deliveryDays: dto.deliveryDays,
      tags: normalizeTags(dto.tags) ?? [],
    });

    if (dto.skillIds?.length) {
      await this.replaceSkills(service.id, dto.skillIds);
    }
    return service;
  }

  async update(userId: string, serviceId: string, dto: UpdateServiceDto): Promise<Service> {
    const { service } = await this.getOwnService(userId, serviceId);

    if (dto.categoryId) {
      await this.assertCategoryExists(dto.categoryId);
    }
    await this.assertSkillsExist(dto.skillIds);

    const updated = await this.servicesRepository.update(service.id, {
      title: dto.title,
      description: dto.description,
      startingPrice: dto.startingPrice,
      deliveryDays: dto.deliveryDays,
      tags: normalizeTags(dto.tags),
      ...(dto.categoryId ? { category: { connect: { id: dto.categoryId } } } : {}),
    });

    // Absent skillIds means "leave them alone"; an empty array means
    // "remove them all". Collapsing the two would make clearing skills
    // impossible.
    if (dto.skillIds !== undefined) {
      await this.replaceSkills(service.id, dto.skillIds);
    }

    return updated;
  }

  async setVisibility(
    userId: string,
    serviceId: string,
    dto: ServiceVisibilityDto,
  ): Promise<Service> {
    const { service } = await this.getOwnService(userId, serviceId);

    // Idempotent: re-publishing an already-published listing is a no-op
    // rather than an error, so a double-clicked button doesn't fail.
    if (service.status === dto.status) {
      return service;
    }

    // publishedAt is stamped once, on first publish, and never rewritten.
    // Refreshing it on every republish would let a provider bump their
    // listing to the top of the "newest" sort by toggling visibility.
    const firstPublish = dto.status === 'PUBLISHED' && service.publishedAt === null;

    return this.servicesRepository.update(service.id, {
      status: dto.status,
      ...(firstPublish ? { publishedAt: new Date() } : {}),
    });
  }

  async remove(userId: string, serviceId: string): Promise<void> {
    const { service } = await this.getOwnService(userId, serviceId);

    // Soft delete: domain_rules.md requires historical contracts to survive
    // a listing being taken down.
    await this.servicesRepository.softDelete(service.id);
  }

  async listMine(userId: string, pagination: PaginationQueryDto) {
    const profile = await this.getOwnProfile(userId);
    const { page, limit } = pagination;
    const [data, total] = await Promise.all([
      this.servicesRepository.listByProfile(profile.id, (page - 1) * limit, limit),
      this.servicesRepository.countByProfile(profile.id),
    ]);
    return paginate(
      await Promise.all(data.map((row) => this.withSignedImages(row))),
      total,
      page,
      limit,
    );
  }

  // ---------- images ----------

  // Capped because these ride on search-result payloads. Unlike portfolio
  // pieces, which a client opens deliberately, service images load for
  // every card on a browse page.
  private static readonly MAX_IMAGES = 8;

  async addImage(userId: string, serviceId: string, mediaId: string) {
    const { service } = await this.getOwnService(userId, serviceId);

    // Both halves of the rule: the file is this user's, and it finished
    // uploading. Without the second, a listing could carry a permanently
    // broken image on a public search page.
    await this.mediaService.assertAttachable(userId, mediaId);

    const existing = await this.servicesRepository.countImages(service.id);
    if (existing >= ServicesService.MAX_IMAGES) {
      throw new BadRequestException(
        `A service can have at most ${ServicesService.MAX_IMAGES} images`,
      );
    }

    return this.servicesRepository.addImage(service.id, mediaId, existing);
  }

  async removeImage(userId: string, serviceId: string, imageId: string): Promise<void> {
    const { service } = await this.getOwnService(userId, serviceId);
    const result = await this.servicesRepository.removeImage(service.id, imageId);
    if (result.count === 0) {
      throw new NotFoundException('Image not found on this service');
    }
  }

  // ---------- public reads ----------

  /**
   * Swaps stored media references for signed, short-lived URLs — the
   * listing's own images, and the provider avatar embedded in the card.
   * The bucket is private, so this is the only way either reaches a
   * browser, and the objectKey never leaves the API.
   */
  private async withSignedImages<T extends { images?: unknown[]; profile?: unknown }>(
    row: T,
  ): Promise<T> {
    const images = (row.images ?? []) as {
      media?: { objectKey: string; status: string } | null;
    }[];

    return {
      ...row,
      ...(row.profile ? { profile: await this.withSignedAvatar(row.profile) } : {}),
      images: await Promise.all(
        images.map(async ({ media, ...image }) => ({
          ...image,
          // media itself is dropped: objectKey is the storage path, and a
          // client that has it plus a signed URL learns how keys are shaped.
          url: await this.mediaService.signViewUrl(media),
        })),
      ),
    };
  }

  /**
   * Replaces a profile summary's avatarMedia with a signed `avatar`.
   * Separate from withSignedImages because a provider card *is* the
   * profile, whereas a service card merely embeds one.
   */
  private async withSignedAvatar<T>(profile: T): Promise<T> {
    const { avatarMedia, ...rest } = profile as T & {
      avatarMedia?: { objectKey: string; status: string } | null;
    };
    return { ...rest, avatar: await this.mediaService.signViewUrl(avatarMedia) } as T;
  }

  async findPublicById(serviceId: string) {
    const service = await this.servicesRepository.findPublicById(serviceId);
    if (!service) {
      // Deliberately indistinguishable from a listing that does not exist:
      // a different response for "exists but hidden" would let anyone probe
      // for unpublished listings.
      throw new NotFoundException('Service not found');
    }
    return this.withSignedImages(service);
  }

  async search(dto: SearchServicesDto) {
    const filters = await this.buildFilters(dto);
    const { page, limit } = dto;
    const [data, total] = await Promise.all([
      this.servicesRepository.search(filters, dto.sort, (page - 1) * limit, limit),
      this.servicesRepository.countSearch(filters),
    ]);
    return paginate(
      await Promise.all(data.map((row) => this.withSignedImages(row))),
      total,
      page,
      limit,
    );
  }

  async searchProviders(dto: SearchServicesDto): Promise<Paginated<unknown>> {
    const filters = await this.buildFilters(dto);
    const { page, limit } = dto;

    const [groups, total] = await Promise.all([
      this.servicesRepository.searchProviders(filters, dto.sort, (page - 1) * limit, limit),
      this.servicesRepository.countSearchProviders(filters),
    ]);

    const profileIds = groups.map((g) => g.profileId);
    const cards = await this.servicesRepository.findProviderCards(profileIds);

    // `IN` does not preserve order, so the ranking from the grouped query
    // is reapplied here. Without this the sort silently degrades to
    // whatever order Postgres returns the profile rows in.
    const byId = new Map(cards.map((c) => [c.id, c]));
    const data = groups
      .map((group) => {
        const profile = byId.get(group.profileId);
        return profile
          ? {
              ...profile,
              startingFrom: group._min.startingPrice,
              latestListingAt: group._max.createdAt,
            }
          : null;
      })
      .filter((row): row is NonNullable<typeof row> => row !== null);

    return paginate(
      await Promise.all(data.map((row) => this.withSignedAvatar(row))),
      total,
      page,
      limit,
    );
  }

  // ---------- helpers ----------

  private async buildFilters(dto: SearchServicesDto): Promise<ServiceSearchFilters> {
    let categoryIds: string[] | undefined;
    if (dto.category) {
      const resolved = await this.categoriesService.resolveFilterIds(dto.category);
      if (!resolved) {
        throw new BadRequestException(`Unknown category "${dto.category}"`);
      }
      categoryIds = resolved;
    }

    await this.assertSkillsExist(dto.skills);

    return {
      q: dto.q,
      categoryIds,
      skillIds: dto.skills,
      location: dto.location,
      minPrice: dto.minPrice,
      maxPrice: dto.maxPrice,
      availability: dto.availability,
    };
  }

  private async assertCategoryExists(categoryId: string): Promise<void> {
    const category = await this.categoriesRepository.findById(categoryId);
    if (!category) {
      throw new BadRequestException('Category not found');
    }
  }

  // Counted in one query rather than looked up individually: the caller
  // only needs to know whether any id was bogus.
  private async assertSkillsExist(skillIds: string[] | undefined): Promise<void> {
    if (!skillIds?.length) return;
    const unique = [...new Set(skillIds)];
    const found = await this.servicesRepository.countExistingSkills(unique);
    if (found !== unique.length) {
      throw new BadRequestException('One or more skills do not exist');
    }
  }

  private async replaceSkills(serviceId: string, skillIds: string[]): Promise<void> {
    const existing = await this.servicesRepository.findSkillIds(serviceId);
    const current = new Set(existing.map((row) => row.skillId));
    const wanted = new Set(skillIds);

    await Promise.all([
      ...[...wanted]
        .filter((id) => !current.has(id))
        .map((id) => this.servicesRepository.addSkill(serviceId, id)),
      ...[...current]
        .filter((id) => !wanted.has(id))
        .map((id) => this.servicesRepository.removeSkill(serviceId, id)),
    ]);
  }

  private async getOwnProfile(userId: string) {
    const profile = await this.profilesRepository.findByUserId(userId);
    if (!profile) {
      throw new NotFoundException('Profile not found');
    }
    return profile;
  }

  // Resolves the service from the route id and checks ownership. The id
  // always comes from the route, never from the request body — a
  // body-supplied id selecting the row would let any owner edit any
  // listing, which no amount of field allowlisting would catch.
  private async getOwnService(userId: string, serviceId: string) {
    const profile = await this.getOwnProfile(userId);
    const service = await this.servicesRepository.findById(serviceId);
    if (!service) {
      throw new NotFoundException('Service not found');
    }
    assertOwnership(service.profileId, profile.id);
    return { service, profile };
  }
}
