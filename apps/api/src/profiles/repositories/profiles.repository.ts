import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { readableProfileWhere } from '../profile-visibility';
import type { Profile, Prisma } from '@marche/db';

const MAX_NESTED_ITEMS = 100;

// Shared by findByUserIdWithDetails and withDetails: both attach the same
// five collections in the same shape, differing only in which portfolio
// items are visible to the caller reading them.
function nestedCollectionsInclude(portfolioWhere: Prisma.PortfolioWhereInput) {
  return {
    portfolioItems: {
      where: portfolioWhere,
      include: {
        images: { include: { media: { select: { objectKey: true, status: true } } } },
      },
      take: MAX_NESTED_ITEMS,
    },
    experiences: { take: MAX_NESTED_ITEMS },
    educations: { take: MAX_NESTED_ITEMS },
    certifications: { take: MAX_NESTED_ITEMS },
    skills: { include: { skill: true }, take: MAX_NESTED_ITEMS },
    languages: { take: MAX_NESTED_ITEMS },
  } satisfies Prisma.ProfileInclude;
}

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
  //
  // user.capabilities is included for the capability-authorization checks
  // in profile-access.util.ts (Module 01 Slice 2). user.emailVerifiedAt is
  // included for the separate assertEmailVerified check (Module 01 Slice 5)
  // — this is the query getOwnProfileOrThrow uses, which is what
  // JobsService.publish, ProposalsService.submit and
  // DirectContractsService.create all resolve their caller's profile
  // through, so one query change covers all three verification gates.
  // role stays selected too — not read by any authorization check any
  // more (Slice 4 removed the fallback), but User.role/UserRole are not
  // dropped from the schema yet (module1-migration-plan.md §2.2 step 5).
  findByUserId(userId: string) {
    return this.prisma.client.profile.findFirst({
      where: { userId, deletedAt: null },
      include: {
        user: {
          select: {
            role: true,
            emailVerifiedAt: true,
            capabilities: { select: { capability: true } },
          },
        },
        avatarMedia: { select: { objectKey: true, status: true } },
      },
    });
  }

  // The one fact Notifications needs and nothing else: which User a Profile
  // belongs to, so a recipient can be resolved from a providerProfileId or
  // clientProfileId without pulling in the rest of ProfilesRepository's
  // heavier reads.
  findUserIdById(profileId: string): Promise<string | null> {
    return this.prisma.client.profile
      .findUnique({ where: { id: profileId }, select: { userId: true } })
      .then((profile) => profile?.userId ?? null);
  }

  // The owner's own profile, nested collections included, in one round trip.
  // getMyProfile previously called findByUserId and then withDetails, which
  // meant two sequential queries plus their nested reads — enough latency
  // against a hosted database to leave the profile page sitting on its
  // loading state for several seconds.
  findByUserIdWithDetails(userId: string) {
    return this.prisma.client.profile.findFirst({
      where: { userId, deletedAt: null },
      include: {
        user: { select: { role: true } },
        avatarMedia: { select: { objectKey: true, status: true } },
        ...nestedCollectionsInclude({ deletedAt: null }),
      },
    });
  }

  // Public reads. Both go through readableProfileWhere, so a suspended or
  // soft-deleted account stops being publicly readable the moment it is
  // suspended — matching what publicServiceWhere and publicJobWhere already
  // do for that user's listings and requirements. viewerUserId is the
  // owner's escape hatch: passing it lets a suspended user still open their
  // own profile.
  findById(id: string, viewerUserId?: string) {
    return this.prisma.client.profile.findFirst({
      where: { AND: [{ id }, readableProfileWhere(viewerUserId)] },
      include: {
        // See the comment on findByUserId — same reason capabilities is
        // included alongside role here.
        user: { select: { role: true, capabilities: { select: { capability: true } } } },
        avatarMedia: { select: { objectKey: true, status: true } },
      },
    });
  }

  findByUsername(username: string, viewerUserId?: string) {
    return this.prisma.client.profile.findFirst({
      where: { AND: [{ username }, readableProfileWhere(viewerUserId)] },
      include: {
        // Same shape as findById/findByUserId, for toPublicView's shared
        // parameter type — see the comment on findByUserId.
        user: { select: { role: true, capabilities: { select: { capability: true } } } },
        avatarMedia: { select: { objectKey: true, status: true } },
      },
    });
  }

  // Deliberately not filtered by account state, unlike the reads above.
  // This answers "is this username taken", and a suspended user still owns
  // theirs — hiding them here would let someone claim it and then collide
  // on the unique index the moment the account is reinstated.
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
  //
  // viewerIsOwner is required rather than defaulted: this is the collection
  // read behind every public profile page, and a forgotten argument here is
  // the difference between honouring a PRIVATE portfolio piece and
  // publishing it. Making the caller state which view it is building means
  // the mistake is a type error rather than a leak. The owner's own reads
  // (findByUserIdWithDetails, and this method with true) stay unfiltered —
  // hiding a provider's private work from their own editor would leave them
  // unable to see or undo the setting.
  withDetails(profileId: string, viewerIsOwner: boolean) {
    return this.prisma.client.profile.findUnique({
      where: { id: profileId },
      include: nestedCollectionsInclude({
        deletedAt: null,
        ...(viewerIsOwner ? {} : { visibility: 'PUBLIC' as const }),
      }),
    });
  }
}
