import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { ReferralsRepository } from '../repositories/referrals.repository';
import { ProfilesRepository } from '../../profiles/repositories/profiles.repository';
import {
  getOwnProfileOrThrow,
  assertClientRole,
  type AuthorizableUser,
} from '../../profiles/profile-access.util';
import { EmailService } from '../../email/email.service';
import { paginate } from '../../marketplace/pagination';
import type { PaginationQueryDto } from '../../profiles/dto/pagination-query.dto';
import type { CreateReferralDto } from '../dto/create-referral.dto';
import type { Referral } from '@marche/db';

// Postgres' unique-violation code — same constant and reasoning as
// SavedProvidersService/ReviewsService: the existence check below is
// check-then-write, not atomic, so a double click can race past it before
// either write commits. The unique constraint on [referrerProfileId, email]
// is what actually stops the second one.
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
export class ReferralsService {
  private readonly logger = new Logger(ReferralsService.name);

  constructor(
    private readonly referralsRepository: ReferralsRepository,
    private readonly profilesRepository: ProfilesRepository,
    private readonly emailService: EmailService,
  ) {}

  /** Client refers someone by email. Sends a real invite email; the referral joins on its own once they register. */
  async create(userId: string, user: AuthorizableUser, dto: CreateReferralDto): Promise<Referral> {
    assertClientRole(user);
    const profile = await getOwnProfileOrThrow(this.profilesRepository, userId);

    const existing = await this.referralsRepository.find(profile.id, dto.email);
    if (existing) {
      throw new ConflictException("You've already referred this email address");
    }

    let referral: Referral;
    try {
      referral = await this.referralsRepository.create({
        referrerProfileId: profile.id,
        name: dto.name,
        email: dto.email,
        specialty: dto.specialty,
        note: dto.note ?? null,
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException("You've already referred this email address");
      }
      throw error;
    }

    // Never lets a downed SMTP server fail the referral itself —
    // EmailService.send already swallows its own errors and logs them.
    await this.emailService.sendReferralInviteEmail(
      dto.email,
      profile.displayName,
      dto.note ?? null,
    );

    return referral;
  }

  async listMine(userId: string, user: AuthorizableUser, pagination: PaginationQueryDto) {
    assertClientRole(user);
    const profile = await getOwnProfileOrThrow(this.profilesRepository, userId);
    const { page, limit } = pagination;

    const [data, total] = await Promise.all([
      this.referralsRepository.listByReferrer(profile.id, (page - 1) * limit, limit),
      this.referralsRepository.countByReferrer(profile.id),
    ]);

    return paginate(data, total, page, limit);
  }

  /**
   * Called from AuthService.register after a new account is created. Marks
   * every INVITED referral for this email JOINED. Swallows its own failure
   * — same convention as NotificationsService's event-creation methods —
   * because a referral bookkeeping miss must never fail a registration.
   */
  async handleUserJoined(email: string): Promise<void> {
    try {
      await this.referralsRepository.markJoined(email);
    } catch (error) {
      this.logger.error(`Failed to mark referrals joined for ${email}`, error as Error);
    }
  }
}
