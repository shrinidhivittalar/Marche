import type { Prisma } from '@marche/db';

// The single definition of "a profile a public reader may fetch".
//
// The third of these — publicServiceWhere and publicJobWhere are the other
// two — and it exists for the same reason: forgetting the account-state
// check in one query is how a suspended account stays reachable. Listings
// and requirements already disappear on suspension because both of those
// filters join the owning user; the profile read did not, so the most
// linked-to public surface in the product kept serving a suspended user's
// bio, portfolio and freshly signed image URLs to anonymous callers.
//
// Kept as its own module rather than folded into the other two because the
// rule is genuinely not the same one: only this surface has an owner who
// must still be let through. A shared "user is live" fragment would be the
// convergence worth making, but it would mean editing two working modules
// for no behaviour change, so it is left as a note rather than done here.
//
// The owner exception is the whole reason this takes an argument. A
// suspended user is hidden from the public, not locked out of their own
// account — they must still be able to open their own profile page, read
// what is on it and correct it. Anything stricter turns a moderation
// action into an account lockout.
//
// A function, not a shared const: the result is spread into Prisma args at
// several call sites and a const could be mutated by any one of them.
export function readableProfileWhere(viewerUserId?: string): Prisma.ProfileWhereInput {
  return {
    deletedAt: null,
    OR: [
      { user: { status: 'ACTIVE', deletedAt: null } },
      // Spread rather than a `userId: viewerUserId` that may be undefined:
      // Prisma treats an undefined field as "no condition", which would
      // turn this branch into a match-everything clause and disable the
      // whole filter for anonymous callers.
      ...(viewerUserId ? [{ userId: viewerUserId }] : []),
    ],
  };
}
