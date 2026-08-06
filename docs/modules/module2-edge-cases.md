# Module 02 — Profiles: Edge Cases

> Source: edge cases identified by the team, reviewed and reconciled before
> implementation. Each item below has a decision, not just a description —
> that's the point of this doc: no open questions left for implementation
> time.

---

## Profile

- **User exists but Profile was never created** — eliminated by design, not defended against: an empty `Profile` row is created in the same flow as `register()`, so this state is structurally impossible rather than something every endpoint has to check for.
- **Duplicate profile creation request** — `Profile.userId` is unique; a second create attempt is rejected at the DB constraint level, not just app logic.
- **Username / display name already taken** — real gap found during this review: `module2.md` lists a `GET /u/:username` endpoint but never defines a `username` field on `Profile`. **Open — needs a decision before implementation**: is username separate from display name, user-chosen, or an auto-generated slug (e.g. from display name + a suffix on collision)?
- **Soft-deleted profile accessed** — same pattern as `User`: excluded from all normal reads once `deletedAt` is set.

## Portfolio

- **Portfolio with no images** — already required by `module2.md`'s own validation section ("at least one image"); enforced at the DTO level.
- **Maximum number of portfolio items** — no cap for Phase 1 (YAGNI — add one only if abuse or real performance need shows up).
- **Deleting a portfolio used in a completed contract** — soft delete, not hard delete. Anything that references a portfolio item historically (if that ever happens) should have already captured what it needs at the time, not live-joined to a mutable Portfolio row.
- **Unsupported / oversized uploads** — validated against an explicit allow-list of mime types and a max size (exact limits TBD when the storage service — R2 — is wired up).
- **Failed upload leaving orphaned image records** — solved by ordering: upload to storage first, write the DB row only after a confirmed successful upload. A failure before that point leaves at worst an orphaned file in storage (cheap, garbage-collectable later), never an orphaned DB row pointing at nothing.

## Skills

- **Duplicate skill added by the same user** — composite unique constraint on `(profileId, skillId)` in `UserSkill`.
- **Invalid / non-existent skill ID** — standard FK validation, 400/404.
- **Removing a skill referenced in active proposals** — **not applicable** in the current design: Proposals read a Profile as a whole, they don't reference individual Skills. Revisit only if Jobs ever gets skill-based matching.

## Experience

- **End date before start date** — validated, rejected.
- **Overlapping experiences** — **explicitly allowed**, not validated against. Real work histories overlap (side gigs, transitions); rejecting this would be wrong, not safe.
- **`currentlyWorking = true` with an end date set** — contradictory state, rejected (or end date cleared server-side on save).
- **Duplicate experience entries** — not enforced. "Duplicate" has no precise, non-fuzzy definition here (same company + title + dates?) — low value for the complexity of getting it right. Skipped for Phase 1.

## Education

- **Graduation year in the future** — **allowed**, not rejected. People legitimately list "Expected 2027" while still enrolled. Validate only that it isn't absurdly far out (e.g. reject >10 years from now) — that's a sanity check, not a business rule.
- **Duplicate education records** — not enforced, same reasoning as Experience.

## Certifications

- **Expired certification** — allowed and stored as-is; expiry is a display concern (frontend can flag it), not a backend validation failure. People legitimately list lapsed certifications.
- **Duplicate certification** — not enforced, same reasoning as Experience/Education.
- **Missing issuer or issue date** — per `module2.md`'s validation section, only Name and Issuing Organization are required; issue date is optional.

## Languages

- **Same language added twice** — composite unique constraint on `(profileId, language)`.
- **Invalid proficiency level** — validated against a fixed enum (reuse the existing `EnglishLevel`-style pattern already used elsewhere in the app).

## Availability

- **Invalid state combination** (e.g. "unavailable" but "accepting projects") — prevented by design: a single availability status enum, not two independent booleans that can contradict each other.
- **Next available date in the past** — validated, rejected.
- **Timezone changes affecting availability** — not a validation rule, an implementation detail: availability dates/times must always be interpreted through the Profile's stored `timezone` field when displayed.

## Public Profile

- **Private profile accessed by a guest** — enforced via the Profile's `visibility` field, checked on every public-read path.
- **Profile without avatar, bio, or portfolio** — not a bug, a genuine empty state. Same pattern already used for freshly registered accounts elsewhere in the app — render gracefully, don't error.
- **Broken image URLs** — graceful fallback (default avatar/placeholder) on the frontend; lower risk once uploads go through a controlled pipeline (R2) instead of arbitrary external URLs.

## Statistics

**Architectural decision, not a bug fix**: `ProfileStatistics` is **computed on read, not cached**. All three edge cases below are eliminated by this decision rather than individually handled:

- ~~Rating exists but no reviews~~ — can't happen; a live query against Reviews returns null/0 naturally when there are none.
- ~~Completed projects count out of sync with Contracts~~ — can't drift; there's nothing cached to drift _from_.
- ~~Cached statistics becoming stale~~ — no cache, no staleness.

Note: Reviews and Contracts modules don't exist yet, so these stats are necessarily empty until those modules are built — expected, not a Module 2 problem to solve now.

## Authorization

- **User edits another user's profile** — ownership check enforced in the service layer on every mutating endpoint (`PATCH /profiles/me` style routes only ever act on the authenticated caller's own profile — there is no `PATCH /profiles/:id` for arbitrary IDs).
- **User deletes another user's portfolio** — same ownership check, applied per-item (portfolio/experience/education/etc. all verify `profileId` belongs to the caller before any mutation).
- **Guest attempts profile modification** — covered by the same `JwtAuthGuard` pattern already established in the Identity module; no new mechanism needed.

## Data Integrity

- **User deleted but Profile remains** — `Profile.userId` cascades on delete (unlike `AuditLog`, which deliberately does _not_ cascade — a profile has no independent value without its user; an audit trail does). Since users are soft-deleted in practice, this mostly matters for consistent access-checking, not actual data loss.
- **Profile without a valid User (orphan record)** — prevented structurally by the FK constraint; not an app-level case to handle, the database won't allow it to exist.
- **Concurrent edits causing lost updates** — acceptable to leave as last-write-wins for Phase 1 (no optimistic locking / version column). Flagged here so it's a deliberate choice, not an oversight — revisit if it ever causes a real reported issue.

---

## The 10 most important (revised)

Original list was 8/10 right as written; two swapped based on the review above.

1. Profile auto-creation race condition at registration — **swapped in**, most likely to actually cause a support ticket if missed.
2. Duplicate skills.
3. Invalid skill reference.
4. Portfolio deletion after completed contracts.
5. Concurrent profile updates (accepted as last-write-wins, not fixed — but must be a deliberate choice).
6. User editing another user's profile.
7. Failed image uploads leaving orphaned data.
8. Private profile accessed publicly.
9. Duplicate profile creation.
10. Profile statistics — resolved by not caching, not by handling drift.

_Dropped from the original 10_: "Invalid experience dates" — real but low-severity (bad UX, not data corruption or a security issue).

---

## Open questions before implementation

- **Username field**: not defined anywhere in `module2.md` despite the `/u/:username` endpoint. Needs a decision on shape (separate field vs. derived slug) before the Profile schema is finalized.
