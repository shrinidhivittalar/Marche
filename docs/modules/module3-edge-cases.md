# Module 03 — Marketplace: Edge Cases

> Same purpose as `module2-edge-cases.md`: every item carries a decision,
> not just a description. Anything genuinely undecided is marked **Open**
> and must be resolved before implementation.

---

## Category

- **Deleting a category that has services** — rejected, not cascaded. Cascading would silently delete providers' listings. The delete endpoint returns a 409 listing the blocking service count; the admin must move or remove those services first.
- **Deleting a category that has children** — rejected for the same reason, even if the parent itself has no services directly attached.
- **Category soft-deleted while services reference it** — soft delete hides it from the public tree and from filter options, but existing services keep their `categoryId`. Those services stop being discoverable by category browse while remaining reachable by search. Acceptable and recoverable; a hard delete would not be.
- **Child assigned a child (three levels)** — rejected at validation. The spec fixes hierarchy at two levels so every category query stays a single join rather than a recursive CTE.
- **Category made a child of itself, or a cycle via parent reassignment** — rejected. A self-parent is a trivially reachable state through the PATCH endpoint and would hang tree traversal.
- **Parent reassigned so a populated child moves branches** — allowed. Services follow their category; no data migration needed since services reference the child directly.
- **Slug collision** — unique constraint on `Category.slug`. The seed is idempotent (upsert by slug), so re-running it is safe.
- **Slug changed after services exist** — allowed. Services reference `categoryId`, never the slug. Any external links to `/categories/:slug` break, which is acceptable while there is no SEO surface.
- **Non-admin calls a category mutation** — 403 via `assertAdminRole` in the service layer, matching the existing `assertProviderRole` pattern.

## Service ownership and roles

- **Client attempts to create a service** — rejected. `domain_rules.md §4` is explicit that only Providers create Services. Enforced in the service layer, so it holds regardless of how the endpoint is reached.
- **Provider edits another provider's service** — rejected via the existing `assertOwnership` helper. Reuse it; do not write a second one.
- **Suspended or soft-deleted user owning published services** — their listings disappear from public reads, enforced by the shared visibility filter joining through Profile → User. Not by denormalising user status onto the Service row, which would need syncing.
- **Provider with a `PRIVATE` profile** — their services are **excluded** from public marketplace results. This follows the authored spec's rule that results must respect profile visibility, and is the opposite of what a service-only reading would suggest. Recorded explicitly because it is a genuine judgment call: a provider who hides their profile is opting out of discovery, not just out of their profile page.
- **Role changes from PROVIDER to CLIENT while owning listings** — **Open**. Nothing in `domain_rules.md` covers role changes and no endpoint performs one today, so this is unreachable in Phase 1. Defensible answers are auto-unpublish or leave-published. Flagged so it isn't discovered later as a surprise.

## Service lifecycle

- **Changing visibility on an already-hidden service** — idempotent no-op, not an error. Avoids race failures on double-clicks for no benefit.
- **Deleting a service referenced by an active contract** — soft delete only. `domain_rules.md §4` requires historical contracts to survive.
- **Editing a service that has active contracts** — allowed. Contracts must capture agreed terms at signing time rather than live-joining a mutable Service row. This is a constraint on the _Contracts_ module, recorded here so it is not missed there.
- **Starting price of 0** — allowed; free and promotional listings are real. Negative prices rejected. A sane upper bound catches fat-finger entry rather than encoding a business rule.
- **Service pointing at a soft-deleted category** — see Category above; the service survives and stays searchable, it just leaves the category browse tree.

## Service skills

- **Same skill added twice to one service** — composite unique on `(serviceId, skillId)`.
- **Non-existent skill ID** — FK validation, surfaced as 400/404, not 500.
- **Skill filter with several IDs** — `skills=a,b` means the service must match **all** of them (AND, not OR). Narrowing is the useful default for a discovery filter; an OR semantic makes adding filters _widen_ results, which reads as broken.
- **Service with no skills** — allowed. It simply never matches a skill filter.

## Tags (free text)

- **Provider's skill isn't in the seeded list** — this is what tags exist for. They put it in a tag, it becomes findable by keyword search, and the filter taxonomy stays clean. Nobody hits a dead end.
- **Tag duplicating a seeded skill** ("event photography" as a tag when the Skill exists) — allowed, not rejected. Policing it would mean fuzzy-matching every tag against the skill list, and the cost of the duplicate is nil: the service simply matches on both paths.
- **Same tag twice on one service** — deduplicated silently on write (case-insensitive), not rejected. It is a typo, not an error worth failing a save over.
- **Empty or whitespace-only tag** — trimmed and dropped, not rejected. Same reasoning.
- **Unbounded tag count or length** — capped on both. Tags ride on search-result payloads, and uncapped free text is a spam and response-size surface.
- **Tags used as a filter** — **explicitly not supported**, and this is the whole point. Free-text values fragment ("photography" / "Photography" / "photo"), so a filter built on them is quietly wrong. Tags are keyword-search and display only. If a tag becomes common enough to deserve filtering, an admin promotes it to a seeded Skill — that is the intended path, not widening tags.
- **Tag containing markup or a script payload** — stored as-is, escaped at render, same as description. Tags are displayed on cards, so this is a real XSS surface and worth an explicit test.
- **Tag case in search** — matching is case-insensitive, so a tag stored "Balloon Artistry" matches `q=balloon`.

## Mass assignment

- **Request body carries `profileId`** — rejected. The owning profile is resolved from the authenticated caller, never read from the body, and is written after the DTO spread so it cannot be overridden even if a future DTO edit lets the field through.
- **Request body carries `status`** — rejected on create and update. Status changes only through `PATCH /services/:id/visibility`, giving one auditable path instead of two.
- **Request body carries timestamps or `deletedAt`** — rejected. Soft-delete state is server-owned; a caller able to set `deletedAt` could un-delete or hide arbitrary rows.
- **Request body carries a field that exists on the Prisma model but not on the DTO** — rejected with a 400 by the global `ValidationPipe` (`forbidNonWhitelisted`). Treated as a backstop, not the control: the DTO's field list is the real authorization boundary.
- **Update payload includes an `id`** — ignored for targeting. The record to update is resolved from the route param and ownership-checked; a body `id` must never select the row, or any owner could edit any service.

## Search and filters

- **Empty or absent `q`** — returns the full filtered set. This is the browse case, not an error and not an empty set.
- **`%` and `_` inside `q`** — LIKE wildcards. Prisma's `contains` is parameterised, but wildcard-escaping behaviour must be **verified at implementation time**, not assumed. Unescaped, a user searching `100%` gets wrong results — a correctness bug rather than a security one.
- **SQL injection via any filter** — structurally prevented by Prisma parameterisation; the spec forbids raw interpolated SQL in the search path. Still worth an explicit test, since search is the obvious attack surface.
- **Very long `q`** — max length enforced at the DTO level.
- **`minPrice` greater than `maxPrice`** — rejected at the DTO level rather than silently returning zero results, which reads to the user as "nothing exists".
- **Category filter on a parent** — rolls up to include all child categories. Filtering "Photography" and getting nothing because every service sits under "Wedding Photography" would be a bug, not a strict reading.
- **Location `"bangalore"` vs stored `"Bengaluru"`** — will not match. Accepted limitation of free-text substring matching, documented as a known gap. Not silently patched with a synonym list, which would be an invisible half-solution.
- **`sort=rating` or `sort=relevance`** — 400 with a message naming the supported values. Not aliased to a fallback order, which would imply ranking that does not exist.
- **Ties in sort order** — every sort applies `id` as a final tiebreaker. Without it, Postgres may return different orders for the same page across requests, and items can duplicate or vanish while paginating.
- **Page beyond the last page** — empty `data` with correct pagination metadata, not a 404.
- **Unpublished, soft-deleted, private, or suspended content leaking into results** — the single most important behaviour in the module. One shared repository method applies the filter, so there is exactly one place it can be forgotten, and it is covered explicitly in the test list.

## Provider discovery

- **Provider with many matching services appearing repeatedly** — deduplicated per provider (`DISTINCT ON` provider). Called out as a business rule in the authored spec and easy to get wrong the moment a join is involved.
- **Which service represents a deduplicated provider** — the cheapest matching one supplies the "starting price" signal. Deterministic and matches user expectation of a "from ₹X" price.
- **Pagination over a deduplicated set** — `total` must count **distinct providers**, not matching services, or `totalPages` will be inflated and the last pages will be empty. A specific, easy-to-miss bug.
- **Provider whose only matching services are hidden** — absent entirely; the same shared visibility filter runs before deduplication, not after.

## Concurrency

- **Two simultaneous visibility changes** — harmless; the operation is idempotent.
- **Editing a service mid-search** — no locking, no snapshot isolation. A result set built moments before an edit may be marginally stale, which is entirely acceptable for a browse surface.

---

## Open items to resolve before implementation

1. **Role change from PROVIDER to CLIENT** (above) — blocking only if role changes become possible during Phase 1. They currently aren't.

Everything else on this page is decided.
