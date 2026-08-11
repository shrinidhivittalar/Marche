import { User } from '../types';
import type { ApiProfile } from './marketplace-api';

// Single source of truth for "is this profile complete", shared by the client and
// vendor dashboards so the criteria can't silently drift apart between the two pages.

/**
 * The real, API-backed answer — use this whenever there is a session.
 *
 * The mock version below reads `companyOrTitle`, `bio`, `location` and
 * `hourlyRate` off the demo user, and none of those is what the profile
 * editor writes any more: once signed in it saves to `/profiles/me`. So the
 * checklists built on it could never be satisfied no matter what the user
 * filled in, and there was no way to dismiss them.
 *
 * Headline, bio and location are the three fields the editor actually
 * offers and the three a provider or client is judged on. `hourlyRate` has
 * no equivalent on the API profile — a provider's prices live on their
 * services — so it is not part of the rule.
 */
export function isApiProfileComplete(profile: ApiProfile | null | undefined): boolean {
  if (!profile) return false;
  return Boolean(profile.headline?.trim() && profile.bio?.trim() && profile.location?.trim());
}

/** The signed-out demo path only. See isApiProfileComplete above. */
export function isProfileComplete(user: User): boolean {
  const hasBasicInfo = Boolean(
    user.companyOrTitle?.trim() && user.bio?.trim() && user.location?.trim(),
  );
  if (user.role === 'vendor') {
    return hasBasicInfo && Boolean(user.hourlyRate && user.hourlyRate > 0);
  }
  return hasBasicInfo;
}
