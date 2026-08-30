import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { ProfilesRepository } from '../repositories/profiles.repository';
import { MediaService } from '../../media/media.service';
import { ReviewsService } from '../../reviews/services/reviews.service';
import { assertProviderRole } from '../profile-access.util';
import type { UpdateProfileDto } from '../dto/update-profile.dto';
import type { UpdateAvailabilityDto } from '../dto/update-availability.dto';
import type { Prisma, Profile } from '@marche/db';

export interface PublicProfileView {
  id: string;
  username: string | null;
  displayName: string;
  headline: string | null;
  bio: string | null;
  avatar: string | null;
  location: string | null;
  role: string;
  verified: boolean;
  availabilityStatus: string;
  portfolioItems: unknown[];
  experiences: unknown[];
  educations: unknown[];
  certifications: unknown[];
  skills: unknown[];
  languages: unknown[];
  statistics: ProfileStatistics;
}

// Computed on read, never cached — see module2-edge-cases.md's Statistics
// section. Sourced from ReviewsService.projectStatsForProfile, which
// combines a completed-connection count (ProposalsModule) with the
// visibility-filtered review stats Reviews already computes — not
// duplicated here.
export interface ProfileStatistics {
  completedProjects: number;
  averageRating: number | null;
  totalReviews: number;
}

@Injectable()
export class ProfilesService {
  // Resolved lazily via ModuleRef rather than constructor-injected: Reviews
  // needs Profiles for its own eligibility checks (ReviewsService), so a
  // static import back into this module would make profiles.module.ts and
  // reviews.module.ts a genuine circular ES-module import — forwardRef()
  // only defers *when* Nest wires the DI graph, not the order the two
  // files' imports evaluate each other's exports at load time, and that
  // broke every unrelated test that pulls in ProfilesModule through a
  // shorter path than AppModule's full graph. ModuleRef with
  // { strict: false } looks ReviewsService up in the whole application
  // container instead, so profiles.module.ts needs no import of
  // ReviewsModule at all. Resolved on first use rather than at
  // construction/onModuleInit time — Nest's own lifecycle-hook ordering
  // across independently-wired module subtrees isn't guaranteed to have
  // ReviewsModule's providers registered yet at that point, but every real
  // call to this always happens after the whole app has finished
  // bootstrapping.
  private reviewsService: ReviewsService | undefined;

  constructor(
    private readonly profilesRepository: ProfilesRepository,
    private readonly mediaService: MediaService,
    private readonly moduleRef: ModuleRef,
  ) {}

  private getReviewsService(): ReviewsService {
    if (!this.reviewsService) {
      this.reviewsService = this.moduleRef.get<ReviewsService, ReviewsService>(ReviewsService, {
        strict: false,
      });
    }
    return this.reviewsService;
  }

  // Called once, at registration — see AuthService.register. Makes "user
  // exists but has no Profile" structurally impossible instead of
  // something every downstream endpoint has to defend against.
  async createForNewUser(
    userId: string,
    displayName: string,
    tx?: Prisma.TransactionClient,
  ): Promise<Profile> {
    return this.profilesRepository.create({ userId, displayName }, tx);
  }

  /**
   * Replaces each portfolio image's stored media reference with a signed,
   * short-lived URL. Nothing persists a URL, so this is the only point at
   * which an image becomes viewable — and the signature expires, which a
   * stored link never would.
   */
  private async withSignedImages(items: unknown[]): Promise<unknown[]> {
    return Promise.all(
      (items as { images?: { media?: { objectKey: string; status: string } | null }[] }[]).map(
        async (item) => ({
          ...item,
          images: await Promise.all(
            // media is dropped rather than spread: objectKey is the storage
            // path and no client needs it.
            (item.images ?? []).map(async ({ media, ...image }) => ({
              ...image,
              url: await this.mediaService.signViewUrl(media),
            })),
          ),
        }),
      ),
    );
  }

  // Returns the nested collections, not just the base row. Without them an
  // owner could add a skill, an experience or a language and never see it on
  // their own profile — every sub-resource POST appeared to do nothing.
  //
  // One query rather than a lookup followed by a details fetch: the two-call
  // version doubled the latency on the page every provider opens first, and
  // against a hosted database that was several seconds of loading state.
  async getMyProfile(userId: string) {
    const profile = await this.profilesRepository.findByUserIdWithDetails(userId);
    if (!profile) {
      throw new NotFoundException('Profile not found');
    }
    return {
      ...profile,
      avatar: await this.mediaService.signViewUrl(profile.avatarMedia),
      portfolioItems: await this.withSignedImages(profile.portfolioItems ?? []),
    };
  }

  async updateMyProfile(userId: string, dto: UpdateProfileDto): Promise<Profile> {
    const profile = await this.profilesRepository.findByUserId(userId);
    if (!profile) {
      throw new NotFoundException('Profile not found');
    }

    if (dto.username) {
      const existing = await this.profilesRepository.findByUsernameExcludingProfile(
        dto.username,
        profile.id,
      );
      if (existing) {
        throw new ConflictException('That username is already taken');
      }
    }

    // Same rule as a portfolio image: the file must belong to this user and
    // have finished uploading. Without it, anyone who learns a media id can
    // wear someone else's picture. Null is allowed through untouched — it
    // clears the avatar rather than setting one.
    if (dto.avatarMediaId) {
      await this.mediaService.assertAttachable(userId, dto.avatarMediaId);
    }

    return this.profilesRepository.update(profile.id, dto);
  }

  async updateMyAvailability(userId: string, dto: UpdateAvailabilityDto): Promise<Profile> {
    const profile = await this.profilesRepository.findByUserId(userId);
    if (!profile) {
      throw new NotFoundException('Profile not found');
    }
    assertProviderRole(profile.user);

    if (dto.nextAvailableDate && new Date(dto.nextAvailableDate) < new Date()) {
      throw new ForbiddenException('nextAvailableDate cannot be in the past');
    }

    return this.profilesRepository.update(profile.id, {
      availabilityStatus: dto.availabilityStatus,
      nextAvailableDate: dto.nextAvailableDate ? new Date(dto.nextAvailableDate) : undefined,
    });
  }

  // requestingUserId is handed to the repository as well as used below. It
  // widens the read to include the caller's own profile, so suspension hides
  // an account from everyone else without locking its owner out of it.
  //
  // A hidden profile answers 404, the same as one that never existed —
  // matching JobsService.findPublicById. Saying "suspended" would confirm
  // the account is there, which is what hiding it is meant to prevent.
  async getPublicProfileById(id: string, requestingUserId?: string): Promise<PublicProfileView> {
    const profile = await this.profilesRepository.findById(id, requestingUserId);
    if (!profile) {
      throw new NotFoundException('Profile not found');
    }
    return this.toPublicView(profile, requestingUserId);
  }

  async getPublicProfileByUsername(
    username: string,
    requestingUserId?: string,
  ): Promise<PublicProfileView> {
    const profile = await this.profilesRepository.findByUsername(username, requestingUserId);
    if (!profile) {
      throw new NotFoundException('Profile not found');
    }
    return this.toPublicView(profile, requestingUserId);
  }

  private async toPublicView(
    profile: Awaited<ReturnType<ProfilesRepository['findById']>> & object,
    requestingUserId?: string,
  ): Promise<PublicProfileView> {
    const isOwner = requestingUserId === profile.userId;
    if (profile.visibility === 'PRIVATE' && !isOwner) {
      throw new ForbiddenException('This profile is private');
    }

    // isOwner decides more than the private-profile gate above: it also
    // decides whether the owner's PRIVATE portfolio pieces come back. This
    // is the public view, so for anyone else they must not.
    //
    // Statistics run alongside the details fetch rather than after it —
    // they read entirely different tables (Connection/Review vs Profile's
    // own nested collections), so there is nothing to serialise them for.
    const [details, statistics] = await Promise.all([
      this.profilesRepository.withDetails(profile.id, isOwner),
      this.getReviewsService().projectStatsForProfile(profile.id),
    ]);

    return {
      id: profile.id,
      username: profile.username,
      displayName: profile.displayName,
      headline: profile.headline,
      bio: profile.bio,
      // Signed at read time from the stored objectKey. No URL is persisted,
      // so moving bucket or provider never means rewriting profile rows.
      avatar: await this.mediaService.signViewUrl(profile.avatarMedia),
      location: profile.location,
      role: profile.user.role,
      verified: profile.verifiedAt !== null,
      availabilityStatus: profile.availabilityStatus,
      portfolioItems: await this.withSignedImages(details?.portfolioItems ?? []),
      experiences: details?.experiences ?? [],
      educations: details?.educations ?? [],
      certifications: details?.certifications ?? [],
      skills: details?.skills ?? [],
      languages: details?.languages ?? [],
      statistics,
    };
  }
}
