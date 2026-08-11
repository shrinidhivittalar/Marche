import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ProfilesService } from '../services/profiles.service';
import { ProfilesController } from '../controllers/profiles.controller';
import type { ProfilesRepository } from '../repositories/profiles.repository';

function buildDetails(overrides: Record<string, unknown> = {}) {
  return {
    portfolioItems: [],
    experiences: [],
    educations: [],
    certifications: [],
    skills: [],
    languages: [],
    ...overrides,
  };
}

function buildProfile(overrides: Record<string, unknown> = {}) {
  return {
    id: 'profile_1',
    userId: 'user_1',
    username: null,
    displayName: 'Jane',
    headline: null,
    bio: null,
    avatar: null,
    location: null,
    timezone: null,
    socialLinks: null,
    visibility: 'PUBLIC',
    availabilityStatus: 'AVAILABLE',
    nextAvailableDate: null,
    verifiedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    user: { role: 'PROVIDER' },
    ...overrides,
  };
}

describe('ProfilesService', () => {
  let profilesRepository: jest.Mocked<ProfilesRepository>;
  let service: ProfilesService;
  let mediaService: { signViewUrl: jest.Mock; assertAttachable: jest.Mock };

  beforeEach(() => {
    profilesRepository = {
      create: jest.fn(),
      findByUserId: jest.fn(),
      findByUserIdWithDetails: jest.fn(),
      findById: jest.fn(),
      findByUsername: jest.fn(),
      findByUsernameExcludingProfile: jest.fn(),
      update: jest.fn(),
      withDetails: jest.fn(),
    } as unknown as jest.Mocked<ProfilesRepository>;

    // Signs the avatar URL from stored media. Returns null here because
    // these fixtures have no avatar — a profile without a picture is a real
    // state, not a broken one.
    mediaService = {
      signViewUrl: jest.fn().mockResolvedValue(null),
      assertAttachable: jest.fn().mockResolvedValue({ id: 'media_1' }),
    };
    service = new ProfilesService(profilesRepository, mediaService as never);
  });

  describe('createForNewUser', () => {
    it('creates a profile with the given display name', async () => {
      profilesRepository.create.mockResolvedValue(buildProfile() as never);

      await service.createForNewUser('user_1', 'Jane');

      expect(profilesRepository.create).toHaveBeenCalledWith(
        {
          userId: 'user_1',
          displayName: 'Jane',
        },
        undefined,
      );
    });
  });

  describe('getMyProfile', () => {
    it('throws NotFoundException if the profile somehow does not exist', async () => {
      profilesRepository.findByUserIdWithDetails.mockResolvedValue(null);

      await expect(service.getMyProfile('user_1')).rejects.toBeInstanceOf(NotFoundException);
    });

    // One query, not a lookup followed by a details fetch: the two-call
    // version doubled latency on the page every provider opens first.
    it('fetches the profile and its collections in a single query', async () => {
      profilesRepository.findByUserIdWithDetails.mockResolvedValue(buildProfile() as never);

      await service.getMyProfile('user_1');

      expect(profilesRepository.findByUserIdWithDetails).toHaveBeenCalledTimes(1);
      expect(profilesRepository.withDetails).not.toHaveBeenCalled();
      expect(profilesRepository.findByUserId).not.toHaveBeenCalled();
    });
  });

  describe('updateMyProfile', () => {
    it('rejects a username that is already taken by another profile', async () => {
      profilesRepository.findByUserId.mockResolvedValue(buildProfile() as never);
      profilesRepository.findByUsernameExcludingProfile.mockResolvedValue(
        buildProfile({ id: 'profile_2' }) as never,
      );

      await expect(service.updateMyProfile('user_1', { username: 'taken' })).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(profilesRepository.update).not.toHaveBeenCalled();
    });

    it('updates successfully when the username is free', async () => {
      profilesRepository.findByUserId.mockResolvedValue(buildProfile() as never);
      profilesRepository.findByUsernameExcludingProfile.mockResolvedValue(null);
      profilesRepository.update.mockResolvedValue(buildProfile({ username: 'jane-doe' }) as never);

      const result = await service.updateMyProfile('user_1', { username: 'jane-doe' });

      expect(profilesRepository.update).toHaveBeenCalledWith('profile_1', { username: 'jane-doe' });
      expect(result).toEqual(expect.objectContaining({ username: 'jane-doe' }));
    });

    it('refuses an avatar the caller does not own', async () => {
      profilesRepository.findByUserId.mockResolvedValue(buildProfile() as never);
      mediaService.assertAttachable.mockRejectedValue(new ForbiddenException());

      await expect(
        service.updateMyProfile('user_1', { avatarMediaId: 'media_owned_by_someone_else' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(profilesRepository.update).not.toHaveBeenCalled();
    });

    it('clears the avatar without checking media when given null', async () => {
      profilesRepository.findByUserId.mockResolvedValue(buildProfile() as never);
      profilesRepository.update.mockResolvedValue(buildProfile() as never);

      await service.updateMyProfile('user_1', { avatarMediaId: null });

      expect(mediaService.assertAttachable).not.toHaveBeenCalled();
      expect(profilesRepository.update).toHaveBeenCalledWith('profile_1', { avatarMediaId: null });
    });
  });

  describe('updateMyAvailability', () => {
    it('rejects a Client trying to set availability', async () => {
      profilesRepository.findByUserId.mockResolvedValue(
        buildProfile({ user: { role: 'CLIENT' } }) as never,
      );

      await expect(service.updateMyAvailability('user_1', {})).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('rejects a nextAvailableDate in the past', async () => {
      profilesRepository.findByUserId.mockResolvedValue(buildProfile() as never);

      await expect(
        service.updateMyAvailability('user_1', { nextAvailableDate: '2000-01-01' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('updates availability for a Provider with a valid date', async () => {
      profilesRepository.findByUserId.mockResolvedValue(buildProfile() as never);
      profilesRepository.update.mockResolvedValue(
        buildProfile({ availabilityStatus: 'LIMITED' }) as never,
      );

      const futureDate = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString();
      await service.updateMyAvailability('user_1', {
        availabilityStatus: 'LIMITED',
        nextAvailableDate: futureDate,
      });

      expect(profilesRepository.update).toHaveBeenCalledWith(
        'profile_1',
        expect.objectContaining({ availabilityStatus: 'LIMITED' }),
      );
    });
  });

  describe('getPublicProfileById / getPublicProfileByUsername', () => {
    it('throws NotFoundException for a non-existent profile', async () => {
      profilesRepository.findById.mockResolvedValue(null);

      await expect(service.getPublicProfileById('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    // The repository, not the service, drops profiles whose owner is
    // suspended or soft-deleted — so what matters here is that the viewer's
    // id reaches it. Without it a suspended owner would be locked out of
    // their own profile page rather than merely hidden from the public.
    it('passes the requesting user through to the repository', async () => {
      profilesRepository.findById.mockResolvedValue(null);
      profilesRepository.findByUsername.mockResolvedValue(null);

      await expect(service.getPublicProfileById('profile_1', 'user_1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await expect(service.getPublicProfileByUsername('jane', 'user_1')).rejects.toBeInstanceOf(
        NotFoundException,
      );

      expect(profilesRepository.findById).toHaveBeenCalledWith('profile_1', 'user_1');
      expect(profilesRepository.findByUsername).toHaveBeenCalledWith('jane', 'user_1');
    });

    it('rejects a private profile viewed by someone else', async () => {
      profilesRepository.findById.mockResolvedValue(
        buildProfile({ visibility: 'PRIVATE' }) as never,
      );

      await expect(
        service.getPublicProfileById('profile_1', 'someone_else'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('allows the owner to view their own private profile', async () => {
      profilesRepository.findById.mockResolvedValue(
        buildProfile({ visibility: 'PRIVATE' }) as never,
      );
      profilesRepository.withDetails.mockResolvedValue({
        portfolioItems: [],
        experiences: [],
        educations: [],
        certifications: [],
        skills: [],
        languages: [],
      } as never);

      const result = await service.getPublicProfileById('profile_1', 'user_1');

      expect(result.id).toBe('profile_1');
    });

    it('allows a guest (no requestingUserId) to view a public profile', async () => {
      profilesRepository.findByUsername.mockResolvedValue(buildProfile() as never);
      profilesRepository.withDetails.mockResolvedValue({
        portfolioItems: [],
        experiences: [],
        educations: [],
        certifications: [],
        skills: [],
        languages: [],
      } as never);

      const result = await service.getPublicProfileByUsername('jane');

      expect(result.displayName).toBe('Jane');
      expect(result.statistics).toEqual({
        completedProjects: 0,
        averageRating: null,
        totalReviews: 0,
      });
    });

    // The repository does the filtering; what the service owes it is an
    // honest answer to "is this the owner looking". Get that wrong and a
    // PRIVATE piece is either published to the world or hidden from the
    // person who wrote it.
    it('asks for the public portfolio when the viewer is not the owner', async () => {
      profilesRepository.findByUsername.mockResolvedValue(buildProfile() as never);
      profilesRepository.withDetails.mockResolvedValue(buildDetails() as never);

      await service.getPublicProfileByUsername('jane', 'someone_else');

      expect(profilesRepository.withDetails).toHaveBeenCalledWith('profile_1', false);
    });

    it('asks for the public portfolio for an anonymous viewer', async () => {
      profilesRepository.findByUsername.mockResolvedValue(buildProfile() as never);
      profilesRepository.withDetails.mockResolvedValue(buildDetails() as never);

      await service.getPublicProfileByUsername('jane');

      expect(profilesRepository.withDetails).toHaveBeenCalledWith('profile_1', false);
    });

    it('asks for the full portfolio when the owner views their own profile', async () => {
      profilesRepository.findByUsername.mockResolvedValue(buildProfile() as never);
      profilesRepository.withDetails.mockResolvedValue(buildDetails() as never);

      await service.getPublicProfileByUsername('jane', 'user_1');

      expect(profilesRepository.withDetails).toHaveBeenCalledWith('profile_1', true);
    });

    // End to end over the two halves of the fix: the repository filter is
    // stubbed here the way the database would apply it, so what is asserted
    // is that a private piece never reaches the public response body while
    // the owner still gets it.
    it('omits a private portfolio item from the public view but keeps it for the owner', async () => {
      const PRIVATE_ITEM = { id: 'item_private', visibility: 'PRIVATE', images: [] };
      const PUBLIC_ITEM = { id: 'item_public', visibility: 'PUBLIC', images: [] };
      profilesRepository.findByUsername.mockResolvedValue(buildProfile() as never);
      profilesRepository.withDetails.mockImplementation(
        (_id: string, viewerIsOwner: boolean) =>
          buildDetails({
            portfolioItems: viewerIsOwner ? [PUBLIC_ITEM, PRIVATE_ITEM] : [PUBLIC_ITEM],
          }) as never,
      );

      const publicView = await service.getPublicProfileByUsername('jane', 'someone_else');
      const ownerView = await service.getPublicProfileByUsername('jane', 'user_1');

      expect(publicView.portfolioItems).toHaveLength(1);
      expect(ownerView.portfolioItems).toHaveLength(2);
    });
  });
});

// The controller is a passthrough, so the only thing worth asserting about
// it is the thing that was wrong: /u/:username has to stay open to anonymous
// callers and still hand a signed-in owner's id to the service. Without that
// id the owner branch of readableProfileWhere cannot fire, and a suspended
// owner gets a 404 on their own page.
describe('ProfilesController /u/:username', () => {
  let profilesService: { getPublicProfileByUsername: jest.Mock };
  let controller: ProfilesController;

  beforeEach(() => {
    profilesService = { getPublicProfileByUsername: jest.fn().mockResolvedValue(null) };
    controller = new ProfilesController(profilesService as never);
  });

  it('reads anonymously, with no viewer id', async () => {
    await controller.getByUsername('jane', undefined);

    expect(profilesService.getPublicProfileByUsername).toHaveBeenCalledWith('jane', undefined);
  });

  it('forwards a signed-in viewer so the owner escape hatch can fire', async () => {
    await controller.getByUsername('jane', { id: 'user_1' } as never);

    expect(profilesService.getPublicProfileByUsername).toHaveBeenCalledWith('jane', 'user_1');
  });
});

// An anonymous read of a live public profile, and a suspended owner reading
// their own — the two ends of the route, driven through the controller into
// a real service so nothing between them is assumed.
describe('/u/:username end to end', () => {
  function wire(findByUsername: jest.Mock) {
    const repository = {
      findByUsername,
      withDetails: jest.fn().mockResolvedValue(buildDetails()),
    } as unknown as jest.Mocked<ProfilesRepository>;
    const media = { signViewUrl: jest.fn().mockResolvedValue(null) };
    return new ProfilesController(new ProfilesService(repository, media as never) as never);
  }

  it('serves an active public profile to an anonymous reader', async () => {
    const controller = wire(jest.fn().mockResolvedValue(buildProfile()));

    const result = await controller.getByUsername('jane', undefined);

    expect(result).toMatchObject({ id: 'profile_1', displayName: 'Jane' });
  });

  // readableProfileWhere already hides the suspended account from everyone
  // else; the repository is stubbed to that behaviour here, keyed on the
  // viewer id the controller passes.
  it('serves a suspended owner their own profile rather than a 404', async () => {
    const controller = wire(
      jest.fn((_username: string, viewerUserId?: string) =>
        Promise.resolve(viewerUserId === 'user_1' ? buildProfile() : null),
      ),
    );

    await expect(controller.getByUsername('jane', undefined)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(
      controller.getByUsername('jane', { id: 'user_1' } as never),
    ).resolves.toMatchObject({ id: 'profile_1' });
  });
});
