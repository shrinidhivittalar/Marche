import { Job } from '../types';
import { CATEGORIES, LOCATIONS } from '../data/categoryOptions';

// Shared by ProviderHomePage and SearchJobsPage, which both need the same open/search-matched
// job set and the same category/location facet counts derived from it.
export function useJobFacets(jobs: Job[], dismissedIds: Set<string>, searchQuery: string) {
  // Only jobs actually accepting bids — excludes drafts, paused jobs (both use status
  // 'Draft'), and jobs that already have a contract (status flips to 'Confirmed' on hire).
  const openJobs = jobs.filter((r) => !dismissedIds.has(r.id) && r.status === 'Open');

  const searchMatched = openJobs.filter(
    (r) =>
      r.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.location.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const categoryCounts = CATEGORIES.filter((cat) => cat !== 'All').map((cat) => ({
    value: cat,
    count: searchMatched.filter((r) => r.category === cat).length,
  }));

  const locationCounts = LOCATIONS.map((loc) => ({
    ...loc,
    count: searchMatched.filter((r) => r.location.toLowerCase().includes(loc.value.toLowerCase())).length,
  }));

  return { openJobs, searchMatched, categoryCounts, locationCounts };
}
