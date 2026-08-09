import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { Profile, Prisma } from '@marche/db';

@Injectable()
export class ProfilesRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(
    data: { userId: string; displayName: string },
    tx?: Prisma.TransactionClient,
  ): Promise<Profile> {
    return (tx ?? this.prisma.client).profile.create({ data });
  }

  // Profile has a `deletedAt` column but no soft-delete flow sets it yet.
  // Filtering it out here is defensive: it costs nothing today and means a
  // future soft-delete doesn't silently leave deleted profiles readable.
  findByUserId(userId: string) {
    return this.prisma.client.profile.findFirst({
      where: { userId, deletedAt: null },
      include: { user: { select: { role: true } } },
    });
  }

  // The owner's own profile, nested collections included, in one round trip.
  // getMyProfile previously called findByUserId and then withDetails, which
  // meant two sequential queries plus their nested reads — enough latency
  // against a hosted database to leave the profile page sitting on its
  // loading state for several seconds.
  findByUserIdWithDetails(userId: string) {
    const MAX_NESTED_ITEMS = 100;
    return this.prisma.client.profile.findFirst({
      where: { userId, deletedAt: null },
      include: {
        user: { select: { role: true } },
        portfolioItems: {
          where: { deletedAt: null },
          include: { images: true },
          take: MAX_NESTED_ITEMS,
        },
        experiences: { take: MAX_NESTED_ITEMS },
        educations: { take: MAX_NESTED_ITEMS },
        certifications: { take: MAX_NESTED_ITEMS },
        skills: { include: { skill: true }, take: MAX_NESTED_ITEMS },
        languages: { take: MAX_NESTED_ITEMS },
      },
    });
  }

  findById(id: string) {
    return this.prisma.client.profile.findFirst({
      where: { id, deletedAt: null },
      include: { user: { select: { role: true } } },
    });
  }

  findByUsername(username: string) {
    return this.prisma.client.profile.findFirst({
      where: { username, deletedAt: null },
      include: { user: { select: { role: true } } },
    });
  }

  findByUsernameExcludingProfile(username: string, excludeProfileId: string) {
    return this.prisma.client.profile.findFirst({
      where: { username, deletedAt: null, NOT: { id: excludeProfileId } },
    });
  }

  update(id: string, data: Prisma.ProfileUpdateInput): Promise<Profile> {
    return this.prisma.client.profile.update({ where: { id }, data });
  }

  // Nested collections are capped, not fully paginated: a profile has one
  // owner adding their own entries, so unbounded growth only happens via
  // abuse, not normal use — a hard cap is enough to stop a single response
  // from returning thousands of rows.
  withDetails(profileId: string) {
    const MAX_NESTED_ITEMS = 100;
    return this.prisma.client.profile.findUnique({
      where: { id: profileId },
      include: {
        portfolioItems: {
          where: { deletedAt: null },
          include: { images: true },
          take: MAX_NESTED_ITEMS,
        },
        experiences: { take: MAX_NESTED_ITEMS },
        educations: { take: MAX_NESTED_ITEMS },
        certifications: { take: MAX_NESTED_ITEMS },
        skills: { include: { skill: true }, take: MAX_NESTED_ITEMS },
        languages: { take: MAX_NESTED_ITEMS },
      },
    });
  }
}
