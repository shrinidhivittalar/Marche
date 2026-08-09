# Marché — Module Status

Where each module actually stands, as opposed to what has been designed. A
module is "done" only when its acceptance criteria are met and verified, not
when the code exists.

| #   | Module              | Status                                          | Verified by                                            |
| --- | ------------------- | ----------------------------------------------- | ------------------------------------------------------ |
| 01  | Identity            | Done                                            | Unit tests, Playwright                                 |
| 02  | Profiles            | Done                                            | Unit tests, Playwright                                 |
| 03  | Marketplace         | Done                                            | Unit tests, Playwright                                 |
| —   | Media pipeline      | Done, **uploads unverified**                    | Unit tests only — no storage configured                |
| 04  | Jobs / Requirements | Done, with two recorded gaps                    | Unit, HTTP and browser tests against the real database |
| 05  | Proposals           | Not started                                     | —                                                      |
| —   | Connection          | Not started, shape to be settled with Module 05 | —                                                      |

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

## Module 05 — Proposals (next)

Blocked on nothing. Two things are already decided and waiting:

- `JobsService.markFilled` exists and is exported for it. `FILLED` has no
  route in Module 04 on purpose — it is the consequence of accepting a
  proposal, so the transition belongs to the workflow that accepts one.
- `proposalDeadline` is stored on the Job and is the field Module 05 should
  read to refuse a late proposal.

The shape of **Connection** is still open: whether accepting a proposal
creates its own row, or is simply a proposal in an accepted state. Worth
settling before the schema is written, since it is the thing messaging and
contracts will later hang off.
