import { ProfilesRepository } from '../repositories/profiles.repository';
import { readableProfileWhere } from '../profile-visibility';
import type { PrismaService } from '../../prisma/prisma.service';

// A structural view of the `where` clauses under test. Narrower than
// Prisma's generated types on purpose — it names exactly the conditions
// these tests care about, so a missing clause fails as a readable
// assertion rather than a type error.
type WhereLike = {
  id?: string;
  username?: string;
  userId?: string;
  deletedAt?: Date | null;
  user?: { status?: string; deletedAt?: Date | null };
  OR?: WhereLike[];
  AND?: WhereLike[];
  NOT?: WhereLike;
};

// Stands in for what the database would do with the clause. The rule is
// worth asserting as behaviour and not just as shape: "did we build an OR"
// passes just as happily when the OR lets everyone through.
function matches(where: WhereLike, row: { userId: string; status: string; deleted: boolean }) {
  if (where.deletedAt !== null) return true;
  return (where.OR ?? []).some((branch) => {
    if (branch.userId) return branch.userId === row.userId;
    return branch.user?.status === row.status && !row.deleted;
  });
}

function build() {
  const profile = {
    findFirst: jest.fn().mockResolvedValue(null),
    findUnique: jest.fn().mockResolvedValue(null),
    create: jest.fn(),
    update: jest.fn(),
  };
  const prisma = { client: { profile } } as unknown as PrismaService;
  return { repository: new ProfilesRepository(prisma), profile };
}

const ACTIVE = { userId: 'user_1', status: 'ACTIVE', deleted: false };
const SUSPENDED = { userId: 'user_1', status: 'SUSPENDED', deleted: false };
const SOFT_DELETED = { userId: 'user_1', status: 'ACTIVE', deleted: true };

describe('readableProfileWhere', () => {
  it('restricts an anonymous read to live accounts', () => {
    const where = readableProfileWhere() as WhereLike;

    expect(where.deletedAt).toBeNull();
    expect(where.OR).toEqual([{ user: { status: 'ACTIVE', deletedAt: null } }]);
  });

  it('hides a suspended user from the public', () => {
    expect(matches(readableProfileWhere() as WhereLike, SUSPENDED)).toBe(false);
  });

  it('hides a soft-deleted user from the public', () => {
    expect(matches(readableProfileWhere() as WhereLike, SOFT_DELETED)).toBe(false);
  });

  it('still shows an active user to the public', () => {
    expect(matches(readableProfileWhere() as WhereLike, ACTIVE)).toBe(true);
  });

  // Suspension hides an account from everyone else; it is not an account
  // lockout. The owner must still be able to open their own profile.
  it('still shows a suspended user their own profile', () => {
    expect(matches(readableProfileWhere('user_1') as WhereLike, SUSPENDED)).toBe(true);
  });

  it('does not let one suspended user see another', () => {
    expect(matches(readableProfileWhere('someone_else') as WhereLike, SUSPENDED)).toBe(false);
  });
});

describe('ProfilesRepository public reads', () => {
  it('applies the visibility filter to findById', async () => {
    const { repository, profile } = build();

    await repository.findById('profile_1');

    const where = profile.findFirst.mock.calls[0][0].where as WhereLike;
    expect(where.AND?.[0]).toEqual({ id: 'profile_1' });
    expect(where.AND?.[1]).toEqual(readableProfileWhere());
  });

  it('applies the visibility filter to findByUsername and forwards the viewer', async () => {
    const { repository, profile } = build();

    await repository.findByUsername('jane', 'user_1');

    const where = profile.findFirst.mock.calls[0][0].where as WhereLike;
    expect(where.AND?.[0]).toEqual({ username: 'jane' });
    expect(where.AND?.[1]).toEqual(readableProfileWhere('user_1'));
  });

  // AND-composed rather than merged: an identifier clause and the
  // visibility clause both survive, where a key-by-key merge would let the
  // caller's own `user` filter overwrite the account-state check.
  it('does not let the identifier clause overwrite the visibility clause', async () => {
    const { repository, profile } = build();

    await repository.findById('profile_1');

    const where = profile.findFirst.mock.calls[0][0].where as WhereLike;
    expect(where.OR).toBeUndefined();
    expect(where.AND).toHaveLength(2);
  });

  // A PRIVATE piece is the provider's own draft. The public view must not
  // carry it, or the setting is decoration.
  it('drops private portfolio items from the public details read', async () => {
    const { repository, profile } = build();

    await repository.withDetails('profile_1', false);

    const include = profile.findUnique.mock.calls[0][0].include;
    expect(include.portfolioItems.where).toEqual({ deletedAt: null, visibility: 'PUBLIC' });
  });

  // The other half of the rule: the owner still sees their private work,
  // otherwise they could set the flag and never be able to unset it.
  it('keeps private portfolio items for the owner', async () => {
    const { repository, profile } = build();

    await repository.withDetails('profile_1', true);

    const include = profile.findUnique.mock.calls[0][0].include;
    expect(include.portfolioItems.where).toEqual({ deletedAt: null });
  });

  it('does not filter the owner-only details read by portfolio visibility', async () => {
    const { repository, profile } = build();

    await repository.findByUserIdWithDetails('user_1');

    const include = profile.findFirst.mock.calls[0][0].include;
    expect(include.portfolioItems.where).toEqual({ deletedAt: null });
  });

  // The uniqueness check deliberately sees every profile: a suspended user
  // still owns their username.
  it('does not filter the username uniqueness check by account state', async () => {
    const { repository, profile } = build();

    await repository.findByUsernameExcludingProfile('jane', 'profile_1');

    const where = profile.findFirst.mock.calls[0][0].where as WhereLike;
    expect(where).toEqual({ username: 'jane', deletedAt: null, NOT: { id: 'profile_1' } });
  });
});
