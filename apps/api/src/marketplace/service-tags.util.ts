export const MAX_TAGS_PER_SERVICE = 10;

// Tags are the escape hatch for work the seeded Skill list doesn't cover,
// so the rule is to clean input rather than reject it: failing someone's
// save because they typed a tag twice or left a trailing space would be
// hostile for zero benefit. Length and count caps are enforced at the DTO
// level, where an over-long tag is a genuine error worth reporting.
//
// Lowercasing is what makes tag search case-insensitive at all — Prisma's
// array filters compare whole elements with no `mode: 'insensitive'`
// option, so normalising on write is the only place it can happen.
export function normalizeTags(tags: string[] | undefined): string[] | undefined {
  if (tags === undefined) return undefined;

  const seen = new Set<string>();
  for (const raw of tags) {
    const tag = raw.trim().toLowerCase();
    if (tag) seen.add(tag);
  }
  return [...seen].slice(0, MAX_TAGS_PER_SERVICE);
}
