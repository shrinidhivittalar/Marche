import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { SavedProvidersRepository } from '../repositories/saved-providers.repository';
import { ProfilesRepository } from '../../profiles/repositories/profiles.repository';
import { getOwnProfileOrThrow, assertClientRole } from '../../profiles/profile-access.util';
import { ServicesRepository } from '../../marketplace/repositories/services.repository';
import { MediaService } from '../../media/media.service';
import { paginate } from '../../marketplace/pagination';
import type { PaginationQueryDto } from '../../profiles/dto/pagination-query.dto';
import type { SavedProvider } from '@marche/db';

// Postgres' unique-violation code — same constant and reasoning as
// ReviewsService: save()'s own existence check is check-then-write, not
// atomic, so a double click or two open tabs can race past it before either
// write commits. The unique constraint on [clientProfileId,
// providerProfileId] is what actually stops the second one.
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
export class SavedProvidersService {
  constructor(
    private readonly savedProvidersRepository: SavedProvidersRepository,
    private readonly profilesRepository: ProfilesRepository,
    private readonly servicesRepository: ServicesRepository,
    private readonly mediaService: MediaService,
  ) {}

  /**
   * Client saves a provider's profile. Idempotent: saving an
   * already-saved provider just returns the existing row rather than
   * erroring, the same convention as NotificationsService.markAsRead.
   */
  async save(userId: string, role: string, providerProfileId: string): Promise<SavedProvider> {
    assertClientRole(role);
    const clientProfile = await getOwnProfileOrThrow(this.profilesRepository, userId);
    await this.assertIsProvider(userId, providerProfileId);

    const existing = await this.savedProvidersRepository.find(clientProfile.id, providerProfileId);
    if (existing) {
      return existing;
    }

    try {
      return await this.savedProvidersRepository.create(clientProfile.id, providerProfileId);
    } catch (error) {
      if (isUniqueViolation(error)) {
        const raced = await this.savedProvidersRepository.find(clientProfile.id, providerProfileId);
        if (raced) return raced;
      }
      throw error;
    }
  }

  /** Whether the caller has saved this provider — what a profile page's Save button renders from. */
  async isSaved(userId: string, role: string, providerProfileId: string): Promise<boolean> {
    if (role !== 'CLIENT') return false;
    const clientProfile = await getOwnProfileOrThrow(this.profilesRepository, userId);
    const existing = await this.savedProvidersRepository.find(clientProfile.id, providerProfileId);
    return existing !== null;
  }

  /** Idempotent by design, not just by accident: unsaving something never saved is a no-op, not an error. */
  async unsave(userId: string, role: string, providerProfileId: string): Promise<void> {
    assertClientRole(role);
    const clientProfile = await getOwnProfileOrThrow(this.profilesRepository, userId);

    try {
      await this.savedProvidersRepository.delete(clientProfile.id, providerProfileId);
    } catch {
      // Nothing to delete — already unsaved. Same outcome either way, so
      // this is not an error state worth surfacing.
    }
  }

  /** The caller's saved providers, as full provider cards — same shape marketplace search results use. */
  async listMine(userId: string, role: string, pagination: PaginationQueryDto) {
    assertClientRole(role);
    const clientProfile = await getOwnProfileOrThrow(this.profilesRepository, userId);
    const { page, limit } = pagination;

    const [saves, total] = await Promise.all([
      this.savedProvidersRepository.listByClient(clientProfile.id, (page - 1) * limit, limit),
      this.savedProvidersRepository.countByClient(clientProfile.id),
    ]);

    const providerIds = saves.map((save) => save.providerProfileId);
    const cards = await this.servicesRepository.findProviderCards(providerIds);
    const byId = new Map(cards.map((card) => [card.id, card]));

    // findProviderCards' `IN` query does not preserve order — reapply the
    // save order (newest first) `saves` already carries.
    const ordered = saves
      .map((save) => byId.get(save.providerProfileId))
      .filter((card): card is NonNullable<typeof card> => card !== undefined);

    const data = await Promise.all(
      ordered.map(async (card) => {
        const { avatarMedia, ...rest } = card;
        return { ...rest, avatar: await this.mediaService.signViewUrl(avatarMedia) };
      }),
    );

    return paginate(data, total, page, limit);
  }

  private async assertIsProvider(userId: string, providerProfileId: string): Promise<void> {
    const target = await this.profilesRepository.findById(providerProfileId, userId);
    if (!target) {
      throw new NotFoundException('Profile not found');
    }
    if (target.user.role !== 'PROVIDER') {
      throw new ConflictException('Only provider profiles can be saved');
    }
  }
}
