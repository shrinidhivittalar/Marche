# Module 05 — Proposals: Edge Cases

> Same purpose as `module2-edge-cases.md` and `module3-edge-cases.md`: every
> item carries a decision, not just a description. Anything genuinely
> undecided is marked **Open** and must be resolved before implementation.
>
> This module differs from every previous one in a way that shapes the whole
> page: it is the first where **two different users can act on the same row at
> the same time**, and where the wrong outcome is a real business failure
> rather than a stale read. A CRUD implementation can pass dozens of unit
> tests and still let one requirement be filled twice in production, so the
> Concurrency section carries the most weight here.

---

## Proposal lifecycle

- **Every transition other than `SUBMITTED → {ACCEPTED, REJECTED, WITHDRAWN}`** — rejected server-side, from one `ALLOWED_TRANSITIONS` table in the service, the same shape `JobsService` uses. A guard scattered across four methods is a guard someone forgets when adding a fifth.
- **Accepting an already-accepted proposal** — 409, **not** an idempotent no-op. This is a deliberate departure from Module 04, where `publish` and `cancel` are idempotent so a double-clicked button does not error. The difference: publishing twice is unambiguous, whereas a second accept may be aimed at a _different_ proposal on the same requirement, and answering "success" to that would confirm something the client never asked for.
- **Rejecting or withdrawing an already-decided proposal** — 409 for the same reason.
- **A proposal on a requirement that is later cancelled** — the proposal stays, in whatever state it was in. It is a record of what was offered; deleting it would rewrite history because the client changed their mind. It simply can never be accepted, since acceptance requires the job to be `PUBLISHED`.
- **Accepting a proposal after `proposalDeadline` has passed** — **allowed**. The deadline gates _providers submitting_, not the client deciding. A client who takes a week over a shortlist should not silently lose it. Recorded explicitly because the opposite reading is defensible and would otherwise be settled by accident in whichever `where` clause got written first.

## Duplicate proposals

- **Double-clicked submit, or a retried request** — the composite unique on `(jobId, providerProfileId)` is the enforcement. The service pre-checks to produce a useful message; the constraint is what actually holds under concurrency, because two simultaneous requests both pass the pre-check.
- **[Must be verified against the DB]** A unique violation surfaces as Prisma **`P2002`** — unlike the `RESTRICT` violations in Module 03, which arrive as an unmapped `PrismaClientUnknownRequestError` with no code at all. Do not assume by analogy with that finding: confirm the shape before writing the handler, or an intended 409 becomes a 500.
- **Submitting again after withdrawing** — 409, and the message must say that withdrawal was final for that requirement rather than reporting a generic duplicate. This is a consequence of the constraint being absolute (see `module5.md`, "Unique Constraints"), and a provider who reads "you already have a proposal" when they can plainly see they withdrew it will file it as a bug.

## Job state changing underneath a submission

- **Job filled, cancelled or deleted between the provider opening the form and submitting** — rejected. Eligibility is evaluated against the current database row inside the request, never against what the frontend was showing. This is the ordinary case of the race in Concurrency below, and the same check answers both.
- **`proposalDeadline` passing while the form is open** — rejected, by the same check. The definition lives in one place: `PUBLISHED`, not deleted, and either no deadline or a future one.
- **Provider loses eligibility between drafting and submitting** — role is re-read at submission, matching how Module 04 re-checks `assertClientRole` at publish rather than trusting the check made at create.

## Ownership and authorization

- **Provider A mutates Provider B's proposal** — 403. Ownership is resolved from the authenticated user's profile and compared to `proposal.providerProfileId`; a UUID in the path is never treated as authorization.
- **Client A accepts a proposal on Client B's requirement** — 403. The chain is: authenticated user → owns the job → proposal belongs to that job → proposal is `SUBMITTED`. Checking `role === CLIENT` alone would let any client decide any requirement, which is the same class of bug as trusting the UUID.
- **403 or 404 for a resource that exists but is not yours** — **403**, after a successful lookup. This follows `assertOwnership` and `JobsService.getOwnJob`, and is deliberately _not_ the 404-to-hide rule Module 04 uses on `GET /jobs/:id`: that rule exists because a hidden requirement must be indistinguishable from a missing one on a **public** route. Proposals have no public route, so there is nothing to hide from an anonymous caller, and consistency with the rest of the codebase wins.
- **Guest reaching any proposal route** — 401. No proposal data is public: not the list, not a single proposal, not an attachment, not the count.
- **Provider submitting to their own requirement** — rejected. Compared by profile, not by user, since both ids are on rows already loaded.
- **Provider with no profile, or a soft-deleted one** — 404 from the shared `getOwnProfile` helper, before any job lookup. Ordering matters: the profile check runs first, so a caller who has no profile gets a consistent 404 rather than an eligibility error about a requirement they could never have proposed on.

## Mass assignment and spoofing

- **Request body carries `providerProfileId`** — rejected. It is resolved from the authenticated caller and written after the DTO fields, so it cannot be overridden even if a future DTO edit lets the field through. Same rule Module 03 applies to `profileId`.
- **Request body carries `status`, `acceptedAt`, `rejectedAt`, `withdrawnAt` or `connectionId`** — rejected. Every lifecycle transition has its own route; none is a field on any DTO.
- **Request body carries `jobId` on a mutation** — ignored for targeting. The proposal is resolved from the route param and ownership-checked. A body id must never select the row.
- **`PATCH /proposals/:id`** — the route does not exist, and its absence is the enforcement. A proposal is immutable once submitted: without that, a provider could quote ₹30,000, wait for the client to shortlist them, and rewrite it to ₹5,000 — or the reverse — which destroys what a proposal means.
- **Any field on the Prisma model but not on the DTO** — 400 from the global `ValidationPipe` (`forbidNonWhitelisted`). A backstop, not the control; the DTO's field list is the authorization boundary.

The provider-settable surface is exactly: `jobId`, `coverMessage`, `proposedPrice`, `deliveryDays`.

## Validation and money

- **Empty or whitespace-only cover message** — rejected. Trimmed first, then length-checked, so a message of thirty spaces fails rather than passing a naive `MinLength`.
- **Negative price** — rejected. **Zero** — allowed, matching `Service.startingPrice`: a free or promotional offer is real.
- **Absurdly large price** — capped at 10,000,000 with at most two decimal places, matching `Job.budgetMin/Max` and `Service.startingPrice`. A fat-finger guard, not a business rule.
- **Price representation** — `Decimal @db.Decimal(10,2)`, the existing convention. **Not** integer minor units: Prisma `Decimal` is arbitrary-precision and is not floating point, so the underlying concern is already answered, and two money conventions in one schema is a bug in itself.
- **Delivery time** — a positive integer number of days, named `deliveryDays` rather than `deliveryTime` so the unit is in the name and cannot be misread as hours.
- **Oversized payload, or more attachments than the cap** — rejected at the DTO level. Same reasoning as Module 03's tag caps: proposal bodies ride on the client's review page, and uncapped free text is a spam and response-size surface.
- **Markup or a script payload in the cover message** — stored as-is, escaped at render, same as service descriptions. The client reads this text in their browser, so it is a real XSS surface and gets an explicit test.
- **SQL injection through any proposal field** — structurally prevented by Prisma parameterisation; no raw interpolated SQL anywhere in the module.

## Historical snapshot

- **Provider changes their profile, service or prices after submitting** — the proposal does not change. Price, delivery days and cover message are copied onto the row at submission and are never live-joined from `Service` or `Profile`. A proposal is what was offered at that moment; a client who accepts one must get what they read.
- **Rejected and withdrawn proposals** — retained, not deleted. There is no delete route and no `deletedAt` column.

## Attachments

- **Attaching another user's media** — rejected by the existing `mediaService.assertAttachable`, which checks ownership and upload status together. Reused, not reimplemented.
- **Attaching media still `PENDING`, or `FAILED`/`DELETED`** — rejected by the same call. This covers the upload-then-immediately-attach race: only `UPLOADED` is attachable, and the check reads the current row.
- **Client attaching a file to a provider's proposal** — rejected; attachment writes are provider-side only.
- **Same file attached twice** — composite unique on `(proposalId, mediaId)`, matching `JobAttachment` and `ServiceImage`.
- **Detaching a file** — the `Media` row is left alone. It belongs to the user, not to the proposal, and they may want it elsewhere. Deleting it is a separate, explicit action. `onDelete: Restrict` on the relation means deleting a file still attached to a live proposal fails loudly rather than silently blanking it.
- **Who may read a proposal's attachments** — the owning provider or the owner of the requirement it targets, via short-lived signed URLs from an authenticated route. Never served from storage directly, and never folded into a public payload.
- **Attached media becomes `PRIVATE`** — decided by where the file landed, not by what the uploader declared, exactly as Module 04 does for requirement attachments.

## Concurrency

This is the section to spend engineering attention on.

- **Two providers submitting simultaneously** — both succeed; they are different rows. Not a race.
- **One provider's two simultaneous submissions** — the unique constraint resolves it; one gets 409. The service pre-check does not, because both requests pass it before either writes.
- **Two acceptances of two different proposals on one requirement** — the case that must never produce two winners. Resolved by making the _first_ statement of the transaction a conditional claim on the job (`UPDATE ... WHERE status = 'PUBLISHED'`); the loser matches zero rows, gets a 409, and rolls back having written nothing. See ADR-006 in `architecture1.3.0.md`.
- **Accept racing withdraw** — the same mechanism, applied to the proposal. Withdrawal must also be a conditional update (`WHERE status = 'SUBMITTED'`), never read-then-write, or both can pass their checks and the second overwrites the first. A proposal must never end up `ACCEPTED` and `WITHDRAWN`.
- **Accept racing reject** — identical shape, identical fix.
- **Competing proposals rejected non-atomically** — the failure this prevents is a requirement that is `FILLED` with one `ACCEPTED` proposal and two still sitting at `SUBMITTED`, which reads to those providers as if they are still in the running. All four writes — job, winner, losers, connection — are in one transaction.
- **Retried acceptance after a lost response** — must not create a second connection. `@@unique` on `Connection.jobId` is the backstop; the conditional claim means the retry sees a job that is already `FILLED` and gets a 409 rather than a duplicate.
- **Reading a proposal list mid-decision** — no locking and no snapshot isolation. A list built moments before an acceptance may be marginally stale, which is acceptable for a review screen; the decision itself is where correctness is enforced.

### The `markFilled` conflict — **decide before writing code**

Module 04 exported `JobsService.markFilled` for precisely this moment, but it
is a read-then-write: `findById`, check the transition, `update`. That is the
shape that loses the race above. Two ways forward, and the choice must be
deliberate:

1. Module 05 does its own conditional `updateMany` inside its transaction —
   race-safe, but `markFilled` becomes dead code and the `FILLED` transition
   rule now lives in two modules.
2. `JobsService` gains a transaction-aware method that takes the `tx` client
   and performs the conditional claim — the rule stays in the module that owns
   the Job, and Proposals still gets its atomicity.

**Decision: option 2.** Option 1 duplicates a lifecycle rule across a module
boundary, which is exactly what exporting `markFilled` was meant to avoid.

## Requirement and account state

- **Client rejects every proposal** — valid, and the requirement does **not** become `FILLED`. It stays `PUBLISHED` and open. But note the consequence of the absolute unique constraint: none of the rejected providers can propose again, so a client who rejects everyone has narrowed their own pool permanently. A Phase 1 cost of that constraint, recorded rather than discovered later.
- **Client rejects some and accepts one** — one transition, one transaction: the accepted proposal, every remaining `SUBMITTED` one, the job, and the connection.
- **Requirement soft-deleted with proposals attached** — unreachable. Module 04 only permits deleting a `DRAFT`, and a draft is not discoverable, so it can never have proposals. Stated so nobody writes a defence against it.
- **Provider's role changes after submitting** — **Open**, and the same open item Module 03 recorded. Nothing in `domain_rules.md` covers role changes and no endpoint performs one, so it is unreachable in Phase 1. The proposal should stay historically valid either way; whether the provider may still _withdraw_ it after losing the role is the part that needs an answer.
- **Client's account is suspended while holding proposals** — **Open**, and genuinely broader than this module. Whether review is blocked, whether an existing connection survives, and whether their requirements auto-cancel are account-policy questions, not proposal questions. Module 05 must not invent an answer; it inherits whatever the platform decides. What it _does_ do meanwhile is follow Module 03's precedent: a suspended user's public content disappears through the shared visibility filter, so their requirements stop being discoverable and no _new_ proposals can arrive.

## Visibility and information leakage

- **Who may see what** — provider: their own proposals. Client: proposals on their own requirements. Guest: nothing. Admin: no endpoints exist, deferred with the admin module.
- **Withdrawn proposals in the client's list** — shown, labelled. Hiding them would make a proposal the client had already read vanish mid-review.
- **A rejected provider learning who won, or what the winning price was** — not exposed. A provider sees their own proposal and its status, never a comparison.
- **Proposal counts on public requirement views** — not exposed in Phase 1. It is derivable data that shapes bidding behaviour, and there is no product decision behind showing it.
- **CSRF** — Module 01 established bearer access tokens with an httpOnly refresh cookie; the refresh endpoint is the CSRF surface and it belongs to that module. Proposals introduces no new one and must not introduce a second auth pattern. Recorded so this is not re-litigated per module.
- **Rate limiting** — `POST /proposals` is the obvious abuse surface: one malicious provider can spam every open requirement. The throttler exists but is **in-memory**, an inherited known gap that works on one instance and silently stops working on two. Module 05 neither fixes it nor makes it worse. A business-level cap on proposals per provider per period is a **product decision** and is not introduced silently.

## Pagination

- **Ties in sort order** — every proposal list applies `id` as a final tiebreaker, matching every other list in the codebase. Without it Postgres may return two same-instant rows in a different order per request, and a proposal can duplicate or vanish while the client pages through them.
- **Page beyond the last page** — empty `data` with correct pagination metadata, not a 404.

---

## Open items to resolve before implementation

1. **`markFilled` vs the conditional claim** — decided above (option 2), but it changes a Module 04 file, so it is called out rather than buried.
2. **Provider role change after submission** — unreachable in Phase 1; blocking only if role changes become possible.
3. **Client account suspension policy** — genuinely undefined platform-wide. Not Module 05's to decide, and flagged so it is not answered by accident in a `where` clause.

Everything else on this page is decided.
