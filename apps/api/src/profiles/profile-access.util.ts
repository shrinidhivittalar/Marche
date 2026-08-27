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

// The shape every capability check in this file accepts. Deliberately not
// tied to one Prisma include or one AuthenticatedUser type: profile.user
// (from ProfilesRepository) and the JwtStrategy-populated request.user are
// two different shapes carrying the same fact.
//
// `role` is kept on this interface even though hasCapability no longer
// reads it: every real caller (Prisma's User shape, JwtStrategy's
// AuthenticatedUser) still carries it regardless, User.role/UserRole are
// not dropped from the schema in this slice
// (module1-migration-plan.md §2.2 step 5, deliberately not yet taken), and
// removing the field here would be a type-signature change with no
// behavioral effect — not something this slice's cutover needs.
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
 * User.status already is).
 *
 * Module 01 Slice 4 cutover: UserCapability is now the sole source of
 * truth. The legacy `user.role` fallback this function used to fall back to
 * (Slice 2 → Slice 3) has been removed, per
 * module1-migration-plan.md §2.2 step 4 ("Cutover") — every backend read
 * path enumerated in module1-migration-plan.md §1.3 goes through this
 * function, and the audit backing this cutover (see
 * registration-capability-lifecycle.integration-spec.ts and
 * platform-role-and-capabilities.integration-spec.ts) confirms every User
 * row that can exist today — pre-Slice-1 users via the Slice 1 migration's
 * deterministic backfill, and every user registered since Slice 3 — holds
 * a matching UserCapability row for its legacy role. `User.role` and the
 * `UserRole` enum are themselves untouched (schema "contract" step, §2.2
 * step 5, is a separate, later, explicitly reviewed step this slice does
 * not take).
 */
export function hasCapability(user: AuthorizableUser, required: Capability): boolean {
  return normalizeCapabilities(user.capabilities).includes(required);
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
