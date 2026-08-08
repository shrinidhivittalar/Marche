import type { Prisma } from '@marche/db';

// The single definition of "publicly discoverable", per module3.md.
//
// This exists as one function rather than an inlined `where` clause in each
// query because forgetting one condition in one place is how unpublished,
// deleted, or private listings leak into public results — the module's worst
// failure mode. Every public read path must build its filter through here.
//
// A function, not a shared const: a const object would be spread into Prisma
// args across several call sites and could be mutated by any one of them.
// This hands back a fresh object each time.
//
// The user-level checks matter as much as the service-level ones. A provider
// can be suspended or deleted long after publishing, and their listings must
// disappear without anyone having to remember to unpublish them — which is
// also why user status is joined rather than copied onto the Service row,
// where it would need syncing.
export function publicServiceWhere(extra?: Prisma.ServiceWhereInput): Prisma.ServiceWhereInput {
  const visible: Prisma.ServiceWhereInput = {
    status: 'PUBLISHED',
    deletedAt: null,
    profile: {
      visibility: 'PUBLIC',
      deletedAt: null,
      user: {
        status: 'ACTIVE',
        deletedAt: null,
      },
    },
  };

  // AND-composed rather than merged key-by-key: a caller passing its own
  // `profile` filter would otherwise overwrite the visibility clause above
  // and silently disable the whole check.
  return extra ? { AND: [visible, extra] } : visible;
}
