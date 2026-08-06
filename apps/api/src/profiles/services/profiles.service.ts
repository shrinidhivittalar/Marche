import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ProfilesRepository } from '../repositories/profiles.repository';
import { assertProviderRole } from '../profile-access.util';
import type { UpdateProfileDto } from '../dto/update-profile.dto';
import type { UpdateAvailabilityDto } from '../dto/update-availability.dto';
import type { Profile } from '@marche/db';

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
// section. Reviews/Contracts modules don't exist yet, so these are
// necessarily zero for now; that's expected, not a bug to fix here.
export interface ProfileStatistics {
  completedProjects: number;
  averageRating: number | null;
  totalReviews: number;
}

@Injectable()
export class ProfilesService {
  constructor(private readonly profilesRepository: ProfilesRepository) {}

  // Called once, at registration — see AuthService.register. Makes "user
  // exists but has no Profile" structurally impossible instead of
  // something every downstream endpoint has to defend against.
  async createForNewUser(userId: string, displayName: string): Promise<Profile> {
    return this.profilesRepository.create({ userId, displayName });
  }

  async getMyProfile(userId: string) {
    const profile = await this.profilesRepository.findByUserId(userId);
    if (!profile) {
      throw new NotFoundException('Profile not found');
    }
    return profile;
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

    return this.profilesRepository.update(profile.id, dto);
  }

  async updateMyAvailability(userId: string, dto: UpdateAvailabilityDto): Promise<Profile> {
    const profile = await this.profilesRepository.findByUserId(userId);
    if (!profile) {
      throw new NotFoundException('Profile not found');
    }
    assertProviderRole(profile.user.role);

    if (dto.nextAvailableDate && new Date(dto.nextAvailableDate) < new Date()) {
      throw new ForbiddenException('nextAvailableDate cannot be in the past');
    }

    return this.profilesRepository.update(profile.id, {
      availabilityStatus: dto.availabilityStatus,
      nextAvailableDate: dto.nextAvailableDate ? new Date(dto.nextAvailableDate) : undefined,
    });
  }

  async getPublicProfileById(id: string, requestingUserId?: string): Promise<PublicProfileView> {
    const profile = await this.profilesRepository.findById(id);
    if (!profile) {
      throw new NotFoundException('Profile not found');
    }
    return this.toPublicView(profile, requestingUserId);
  }

  async getPublicProfileByUsername(
    username: string,
    requestingUserId?: string,
  ): Promise<PublicProfileView> {
    const profile = await this.profilesRepository.findByUsername(username);
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

    const details = await this.profilesRepository.withDetails(profile.id);

    return {
      id: profile.id,
      username: profile.username,
      displayName: profile.displayName,
      headline: profile.headline,
      bio: profile.bio,
      avatar: profile.avatar,
      location: profile.location,
      role: profile.user.role,
      verified: profile.verifiedAt !== null,
      availabilityStatus: profile.availabilityStatus,
      portfolioItems: details?.portfolioItems ?? [],
      experiences: details?.experiences ?? [],
      educations: details?.educations ?? [],
      certifications: details?.certifications ?? [],
      skills: details?.skills ?? [],
      languages: details?.languages ?? [],
      statistics: { completedProjects: 0, averageRating: null, totalReviews: 0 },
    };
  }
}
