import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { Capability, UserRole } from '@marche/db';
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

// A single capability entry as it comes back from either data source this
// module reads it from: the raw Prisma shape (profile.user.capabilities,
// `{ capability: Capability }[]`) or the flattened shape JwtStrategy already
// exposes on the authenticated request (`Capability[]`). Callers pass
// whichever they already have — see normalizeCapabilities below.
type CapabilityLike = Capability | { capability: Capability };

// The shape every capability/role check in this file accepts. Deliberately
// not tied to one Prisma include or one AuthenticatedUser type: profile.user
// (from ProfilesRepository) and the JwtStrategy-populated request.user are
// two different shapes carrying the same two facts.
export interface AuthorizableUser {
  role: UserRole;
  capabilities?: readonly CapabilityLike[];
}

function normalizeCapabilities(capabilities: readonly CapabilityLike[] | undefined): Capability[] {
  if (!capabilities) return [];
  return capabilities.map((c) => (typeof c === 'string' ? c : c.capability));
}

/**
 * Capability-set membership, loaded from the database (never from a JWT
 * claim — capabilities are re-resolved fresh on every request the same way
 * User.status already is), with a legacy-role fallback for the
 * expand/migrate transition (module1-migration-plan.md §2.2,
 * module1-implementation-contract.md §2.4).
 *
 * Why the fallback exists: Module 01 Slice 1 backfilled a UserCapability
 * row for every user that existed before it shipped, but registration does
 * not yet grant one to new users — that is deferred to a later slice. Without
 * this fallback, every user who registers between Slice 1 and whichever
 * slice adds capability-granting at registration would hold zero
 * capabilities and be locked out of every Client/Provider action despite
 * having a perfectly valid legacy role. Falling back to `role` closes that
 * gap exactly for the users it affects, and is a no-op (the capability row
 * already matches) for every user Slice 1 already backfilled.
 *
 * This fallback must not be deleted until a later slice confirms
 * registration grants a capability row to every new user — removing it
 * before then would silently lock out anyone who registered during the
 * transition window.
 */
export function hasCapability(user: AuthorizableUser, required: Capability): boolean {
  const granted = normalizeCapabilities(user.capabilities).includes(required);
  return granted || user.role === required;
}

export function assertProviderRole(user: AuthorizableUser): void {
  if (!hasCapability(user, 'PROVIDER')) {
    throw new ForbiddenException('This is only available on Provider profiles');
  }
}

// The mirror of the above, for the client side of the marketplace. Posting
// a requirement is a Client action: a Provider doing it would be hiring
// through an account built for being hired, and the two sides of a job
// must stay distinguishable for Module 5.
export function assertClientRole(user: AuthorizableUser): void {
  if (!hasCapability(user, 'CLIENT')) {
    throw new ForbiddenException('This is only available to Clients');
  }
}

export function assertOwnership(resourceProfileId: string, callerProfileId: string): void {
  if (resourceProfileId !== callerProfileId) {
    throw new ForbiddenException('You do not have access to this resource');
  }
}
