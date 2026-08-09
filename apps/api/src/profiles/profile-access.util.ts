import { ForbiddenException } from '@nestjs/common';

// Shared by every Profile sub-resource service (Portfolio, Experience,
// Education, Certification, Skills, Languages) — all of them need the same
// two checks: "is this a Provider-only resource being used by a Client?"
// and "does this resource actually belong to the caller?".

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
