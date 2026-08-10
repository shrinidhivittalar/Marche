# Marché — Module Status

Where each module actually stands, as opposed to what has been designed. A
module is "done" only when its acceptance criteria are met and verified, not
when the code exists.

| #   | Module              | Status                             | Verified by                                            |
| --- | ------------------- | ---------------------------------- | ------------------------------------------------------ |
| 01  | Identity            | Done                               | Unit tests, Playwright                                 |
| 02  | Profiles            | Done                               | Unit tests, Playwright                                 |
| 03  | Marketplace         | Done                               | Unit tests, Playwright                                 |
| —   | Media pipeline      | Done, **uploads unverified**       | Unit tests only — no storage configured                |
| 04  | Jobs / Requirements | Done, with two recorded gaps       | Unit, HTTP and browser tests against the real database |
| 05  | Proposals           | Backend done, frontend not started | Unit, HTTP and real-database concurrency tests         |
| —   | Connection          | Built, as its own row              | Covered by the Module 05 tests                         |

Everything after Connection — messaging, contracts, payments, reviews,
notifications — is deliberately outside the core workflow and unstarted.

---

## Module 04 — Jobs / Requirements

Product language is **Requirement**; domain and code language is **Job**.
Only `Job` appears in code, only "requirement" appears in anything a person
reads.

### Delivered

- Schema, three migrations, applied and verified against the hosted database
- Repository, service, controller and DTO layers
- Lifecycle: create, edit, publish, cancel, delete-a-draft
- Discovery: browse, keyword search, five filters, four sorts, pagination
- Private attachments through the shared media pipeline
- Event times, proposal deadline, deliverables
- Ownership and RBAC enforced server-side on every mutation
- Client screens: the post-a-requirement wizard, the requirement list, the
  detail view with publish and cancel
- Provider screens: the requirement board and the detail view
- 316 API unit tests, 29 HTTP behaviours, 13 browser journeys

### Deliberately not built

Each of these was specified in `module4.md` and dropped for a stated reason,
rather than missed:

- **`PROPOSAL_ACTIVITY` status** — derivable by counting proposals. Storing it
  means Module 05 must flip it on every proposal and unflip it on every
  withdrawal, and every discovery query must match two statuses instead of
  one.
- **Job `visibility`** — a published-but-private requirement has no audience
  in Phase 1: no invite, no share link. `DRAFT` already means "only the owner
  sees this". The `Service` model made the same call.
- **`deadline` as distinct from `eventDate`** — one date until a second has a
  meaning that can be stated without reference to the first.
- **`budgetMode`** — `budgetMin === budgetMax` is what "fixed" means. A mode
  column would store the same fact twice and let the two disagree.
- **Pause / resume** — reopens a lifecycle already built and tested.
  Cancelling is how a client stops receiving proposals.
- **Admin endpoints** — no admin module exists; guarding a door nobody walks
  through is untested code.
- **Requirement expiry** — needs a scheduler this application does not have.

### Known gaps

1. **Attachment uploads are unverified.** `STORAGE_*` is unset, so no file has
   ever been uploaded. The authorisation around attachments is tested
   (401/403/404), and the UI states its types and limits, but the upload path
   itself has only ever run against mocks. Needs R2 credentials or MinIO.
2. **Public discovery has no door.** `GET /jobs` is public by design, but
   `App.tsx` gates `/provider/*` to vendors, so a signed-out visitor cannot
   reach the requirement board. Backend and frontend disagree about who may
   browse. Nothing leaks; the capability is simply unreachable. Needs a
   product decision, not a patch.
3. **Rate limiting is in-memory.** Inherited, not introduced here — it works
   on one instance and silently stops working on two. Public discovery and the
   mutation endpoints are affected.
4. **No content safety on uploads.** The media pipeline verifies that a file
   is well-formed, not that it is safe or appropriate. Report-and-takedown is
   the intended Phase 1 answer.

### Test accounts and residue

See `module4-e2e-results.md` for the throwaway accounts, the one manual
database write that was needed to create them, and the rows left behind.

---

## Module 05 — Proposals

Spec: `docs/modules/module5.md`, with `docs/modules/module5-edge-cases.md`
alongside it. Both written 2026-08-10, reviewed before any code was cut.

**The backend is complete and verified. The frontend is not started.**

### Delivered

- Schema and one migration, applied and verified against the hosted database
- Repository, service, controller and DTO layers for Proposals and Connections
- Lifecycle: submit, withdraw, accept, reject — every transition server-owned,
  every one on its own route, no PATCH anywhere
- Transactional acceptance: fills the requirement, rejects the competition and
  creates the connection, all or nothing
- Private attachments through the shared media pipeline
- Ownership and RBAC enforced server-side on every route; nothing is public
- 13 endpoints, all documented in Swagger with bearer auth
- 123 unit tests, 52 HTTP behaviours, 5 real-database concurrency tests

### The concurrency guarantee, and how it is verified

Acceptance claims the requirement with a conditional `UPDATE` as the first
statement of its transaction (ADR-006). Two clients accepting two different
proposals produce exactly one winner; the loser gets a 409 having written
nothing.

The unit tests assert the _shape_ of that — the status test inside the UPDATE,
the claim written first. They cannot prove Postgres actually serialises the
two writers, which is the whole safety property, so that runs against the real
database instead:

```
npm --workspace @marche/api run test:integration
```

Five cases: two simultaneous acceptances, clean rollback of the loser,
accept-vs-withdraw, accept-vs-reject, and two simultaneous submissions from
one provider. Deliberately **not** part of `npm test` — there is no test
database, and the default run must never write to the hosted one, which is
why the file is named `.integration-spec.ts`. Everything it creates is
prefixed `m5-concurrency-` and deleted in `afterAll`, including on failure;
verified to leave nothing behind.

That last case also confirmed something the edge-case doc flagged as needing
checking rather than assuming: a duplicate proposal really does surface as
Prisma `P2002`, unlike the `RESTRICT` violations Module 03 found arriving as
an unmapped error with no code at all.

### Changed in Module 04

`JobsService.markFilled` was replaced by `claimFilled(tx, jobId)`. The old
method was a read-then-write, which is exactly the shape that loses the race
above — both requests read `PUBLISHED`, both pass the transition check, both
write. The new one takes Module 05's transaction client and carries the status
test inside the UPDATE, so the `FILLED` rule still lives in the module that
owns the Job lifecycle. The claimable statuses are derived from
`ALLOWED_TRANSITIONS` rather than hard-coded, so the lifecycle keeps one
definition.

`JobsModule` now also exports `JobsRepository`, the same read-only
cross-module dependency Jobs itself has on Profiles and Marketplace.

### Not built

- **The frontend.** `SubmitProposalPage`, `ProposalDetailPage` and `MyWorkPage`
  exist in `apps/web` as mockups on `mockData`, exactly as the jobs screens did
  before Module 04 wired them. Nothing on the proposal path is on the real API
  yet, which is also why there are no Playwright journeys for this module.
- **Administrator moderation endpoints** — no admin module exists. Same call
  Module 04 made.
- **`Connection.status`** — a one-member enum. The row existing is what
  "active" means.
- **Proposal soft delete** — nothing deletes a proposal.
- **Rejection reasons** — nothing would read one until Notifications exists.
- **Re-proposing after withdrawal** — needs a partial unique index Prisma
  cannot express. Phase 2.

### Known gaps

1. **Attachment uploads remain unverified**, inherited from the media pipeline:
   `STORAGE_*` is unset, so no file has ever been uploaded. The authorisation
   around proposal attachments is tested; the upload path itself has only run
   against mocks.
2. **Rate limiting is in-memory.** Inherited, not introduced here.
   `POST /proposals` is a real abuse surface — one provider can spam every open
   requirement — and the throttler works on one instance and silently stops
   working on two.
3. **No business-level cap** on proposals per provider per period. A product
   decision, deliberately not introduced silently.

### Open questions settled during the spec review

- **Connection is its own row**, not "a proposal in the accepted state". It is
  created only inside the acceptance transaction, never through a route.
  Everything downstream — messaging, contracts, payments — belongs to _two
  parties for one job_, and a Proposal row is a historical record of what was
  offered, not a live thing two parties act through.
- **One proposal per provider per job, absolutely.** The unique constraint
  wins over the plan's looser "one _active_ proposal" wording, so **withdrawal
  is permanent for that requirement.** Re-proposing needs a partial index
  Prisma cannot express, and is Phase 2.
- **Concurrent acceptance** is serialised by a conditional `UPDATE` on the job
  as the first statement of the transaction, with a unique constraint on
  `Connection.jobId` as the backstop. Recorded as ADR-006.
- **No `ConnectionStatus`, no `Proposal.deletedAt`, no rejection reason** —
  a one-member enum, a soft-delete column nothing writes, and a field nothing
  would read until Notifications exists.

Full list of departures from the original plan: the "Revisions to the
Original Plan" section at the end of `module5.md`.

### Still open

1. ~~`JobsService.markFilled` is not race-safe.~~ **Done** — replaced by
   `claimFilled`, see "Changed in Module 04" above.
2. **Provider role change after submitting** — unreachable in Phase 1, same
   open item Module 03 recorded.
3. **Client account suspension policy** — undefined platform-wide, and not
   Module 05's to decide.

### Documentation

Module 04 shipped without bumping the versioned docs, so its reconciliation
was folded into Module 05's. Current versions are now **1.3.0** across
`architecture`, `database`, `dataflow` and `phase_scope`; each carries a
changelog block and HTML comment markers around every changed section.
