import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { ProfilesRepository } from './repositories/profiles.repository';

// Shared by every Profile sub-resource service (Portfolio, Experience,
// Education, Certification, Skills, Languages) — all of them need the same
// two checks: "is this a Provider-only resource being used by a Client?"
// and "does this resource actually belong to the caller?".

// The "find this user's profile or 404" lookup every module that owns a
// per-user resource needs before it can check ownership of anything.
// Duplicated by hand across Jobs, Proposals and Connections until this was
// pulled out — one definition means a change to what "no profile" means
// only has to happen once.
export async function getOwnProfileOrThrow(profilesRepository: ProfilesRepository, userId: string) {
  const profile = await profilesRepository.findByUserId(userId);
  if (!profile) {
    throw new NotFoundException('Profile not found');
  }
  return profile;
}

export function assertProviderRole(role: string): void {
  if (role !== 'PROVIDER') {
    throw new ForbiddenException('This is only available on Provider profiles');
  }
}

// The mirror of the above, for the client side of the marketplace. Posting
// a requirement is a Client action: a Provider doing it would be hiring
// through an account built for being hired, and the two sides of a job
// must stay distinguishable for Module 5.
export function assertClientRole(role: string): void {
  if (role !== 'CLIENT') {
    throw new ForbiddenException('This is only available to Clients');
  }
}

export function assertOwnership(resourceProfileId: string, callerProfileId: string): void {
  if (resourceProfileId !== callerProfileId) {
    throw new ForbiddenException('You do not have access to this resource');
  }
}
