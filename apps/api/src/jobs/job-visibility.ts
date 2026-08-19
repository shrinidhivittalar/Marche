import type { Prisma } from '@marche/db';

// The single definition of "a requirement a provider may discover".
//
// One function rather than an inlined `where` in each query, for the same
// reason publicServiceWhere exists: forgetting one condition in one place
// is how drafts and cancelled requirements leak into public results, which
// is this module's worst failure mode. Every public read path builds its
// filter through here.
//
// status === 'PUBLISHED' does all the lifecycle work by itself. DRAFT,
// CANCELLED and FILLED are excluded because they simply are not this
// value — which is the argument for having one status field instead of a
// status and a visibility that must agree.
//
// isDirect: false is defense-in-depth, not the primary guard — a direct
// contract (DirectContractsService) goes straight from DRAFT to FILLED and
// so is already excluded by the status check above. Kept explicit anyway:
// it says outright that a direct contract is never meant to be discovered,
// rather than leaving that as an inference from a status transition.
//
// The user-level checks matter as much as the job-level ones. A client can
// be suspended or delete their account long after publishing, and their
// requirements must disappear without anyone having to remember to cancel
// them — which is also why user status is joined rather than copied onto
// the Job row, where it would need syncing.
//
// Profile visibility is deliberately NOT checked. A PRIVATE profile is
// hidden from marketplace *provider* discovery (module2), but posting a
// requirement is a separate, deliberate publish action by the client. A
// client who keeps a quiet profile and still wants quotes is a normal
// case, not a contradiction.
export function publicJobWhere(extra?: Prisma.JobWhereInput): Prisma.JobWhereInput {
  const visible: Prisma.JobWhereInput = {
    status: 'PUBLISHED',
    isDirect: false,
    deletedAt: null,
    clientProfile: {
      deletedAt: null,
      user: {
        status: 'ACTIVE',
        deletedAt: null,
      },
    },
  };

  // AND-composed rather than merged key-by-key: a caller passing its own
  // `clientProfile` filter would otherwise overwrite the clause above and
  // silently disable the whole check.
  return extra ? { AND: [visible, extra] } : visible;
}
