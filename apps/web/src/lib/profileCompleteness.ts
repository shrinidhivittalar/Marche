import { User } from '../types';

// Single source of truth for "is this profile complete", shared by the client and
// vendor dashboards so the criteria can't silently drift apart between the two pages.
export function isProfileComplete(user: User): boolean {
  const hasBasicInfo = Boolean(
    user.companyOrTitle?.trim() && user.bio?.trim() && user.location?.trim()
  );
  if (user.role === 'vendor') {
    return hasBasicInfo && Boolean(user.hourlyRate && user.hourlyRate > 0);
  }
  return hasBasicInfo;
}
