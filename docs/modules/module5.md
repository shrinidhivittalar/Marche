# Module 05 — Proposals

## Status

Phase 1 (MVP)

> **Decision:** Module 05 owns the Provider proposal lifecycle and the
> Client's proposal review/decision flow.
>
> Module 04 owns Requirements/Jobs.
>
> Module 05 ends when a Proposal is accepted or rejected and the successful
> hiring relationship is established.
>
> Contracts, Payments, Messaging, Reviews, and Notifications are separate
> modules.

> Companion document: `module5-edge-cases.md`, which carries a decision for
> every corner case rather than repeating the happy path. Three items there
> are **Open** and are listed at its foot.

<!-- ============================================================ -->
<!-- [Module 5] REVISIONS APPLIED TO THE ORIGINAL PLAN            -->
<!--                                                              -->
<!-- Every change made to the plan as first written is marked     -->
<!-- inline with **[Changed]**, **[Added]** or **[Removed]**, and -->
<!-- summarised in "Revisions to the Original Plan" at the end of -->
<!-- this document. Nothing was altered silently.                 -->
<!-- ============================================================ -->

---

# Purpose

The Proposals module is responsible for allowing Service Providers to respond to Client Requirements and allowing Clients to evaluate and decide between submitted Proposals.

It represents the provider side of the core Marche workflow:

```text
Provider
  ↓
Browse Requirement
  ↓
View Requirement
  ↓
Submit Proposal
  ↓
Client Reviews Proposals
  ↓
Accept / Reject
  ↓
Connection Established
```

The module manages Proposal state, ownership, submission, review, acceptance, rejection, and the transition of the associated Job into a filled state.

---

# Goals

- Allow Providers to submit Proposals
- Allow Providers to manage their own Proposals
- Allow Clients to view Proposals for their Requirements
- Allow Clients to accept a Proposal
- Allow Clients to reject a Proposal
- Prevent duplicate Proposals from the same Provider for one Job
- Support Proposal attachments
- Track Proposal lifecycle
- Establish a connection when a Proposal is accepted
- Prevent proposals against unavailable Requirements
- Maintain Proposal ownership and authorization
- Provide the foundation for future Contracts and Messaging

---

# Non Goals

The following features are intentionally excluded from Phase 1.

- Authentication
- Profile Management
- Marketplace Service Management
- Job / Requirement Management
- Contracts
- Payments
- Messaging
- Reviews
- Notifications
- Disputes
- Escrow
- AI Proposal Generation
- AI Proposal Ranking
- Proposal Recommendations
- Proposal Versioning
- Negotiation / Counter Offers

---

# Responsibilities

The module is responsible for:

- Proposal Creation
- Proposal Submission
- Proposal Ownership
- Proposal Attachments
- Proposal Review
- Proposal Acceptance
- Proposal Rejection
- Proposal Withdrawal
- Proposal Lifecycle
- Duplicate Proposal Prevention
- Hiring Decision
- Connection Establishment

The module is NOT responsible for:

- Authentication
- Profiles
- Marketplace Services
- Job Creation
- Job Editing
- Job Publishing
- Contracts
- Payments
- Messaging
- Reviews
- Notifications

---

# Actors

Guest

Authenticated User

Client

Provider

Administrator

---

# User Stories

### Guest

- Cannot submit Proposals
- Cannot view private Proposals
- Cannot accept or reject Proposals

### Provider

- View published Requirements
- Submit Proposal
- View own Proposals
- View Proposal status
- Withdraw Proposal where allowed
- Attach files to Proposal
- Cannot modify another Provider's Proposal

### Client

- View Proposals for own Requirements
- Review Proposal details
- View Proposal attachments
- Accept Proposal
- Reject Proposal
- View Proposal status
- Cannot manage Proposals belonging to another Client's Requirement

### Administrator

**[Changed]** Administrator stories are **deferred, not built**, matching the
call Module 04 made for the same reason: no admin module exists, and guarding
a door nobody walks through is untested code. The rows below are kept so the
intent is recorded, and are listed under "Deliberately Not Built".

- ~~View Proposals for moderation~~ — deferred
- ~~Moderate Proposal visibility where required~~ — deferred

---

# Core Workflow

```text
Client
  ↓
Create Requirement
  ↓
Publish Requirement
  ↓
Provider discovers Requirement
  ↓
Provider views Requirement
  ↓
Submit Proposal
  ↓
Client receives Proposal
  ↓
Client reviews Proposal
  ↓
Accept / Reject
       │
       ├───────────────┐
       ↓               ↓
   ACCEPTED         REJECTED
       │
       ↓
Connection Established
```

---

# Proposal Lifecycle

The Phase 1 lifecycle is:

```text
SUBMITTED
   │
   ├──→ ACCEPTED
   │
   ├──→ REJECTED
   │
   └──→ WITHDRAWN
```

**[Decision]** Proposals do not have a Draft state in Phase 1.

A Provider submits a Proposal as one atomic operation.

This avoids storing incomplete Proposal records and keeps the core workflow simple.

---

## SUBMITTED

The Provider has successfully submitted a Proposal.

The Client can:

- View it
- Review it
- Accept it
- Reject it

The Provider can:

- View it
- Withdraw it if the Job has not already been decided

---

## ACCEPTED

The Client has selected this Proposal.

The Proposal becomes immutable.

The associated Job becomes:

```text
FILLED
```

A Connection is established.

Only one Proposal may be accepted for a Job.

---

## REJECTED

The Client has rejected the Proposal.

A rejected Proposal cannot be submitted again.

The Provider can retain it for historical reference.

---

## WITHDRAWN

The Provider voluntarily withdraws the Proposal before the Client accepts it.

A withdrawn Proposal cannot be accepted.

**[Changed]** Withdrawal is **final for that Job**. Because the unique
constraint on `(jobId, providerProfileId)` is absolute (see "Unique
Constraints"), a Provider who withdraws cannot submit a replacement Proposal
for the same Requirement. The error returned on a second attempt says so
explicitly rather than reporting a generic duplicate.

---

# Business Rules

- Only users with role `PROVIDER` may create Proposals.
- Every Proposal belongs to exactly one Provider.
- Every Proposal belongs to exactly one Job.
- **[Changed]** A Provider may submit **exactly one** Proposal per Job, ever —
  not "one active". See "Unique Constraints" for why the looser rule was
  dropped.
- A Proposal can only be submitted against a Job that is **accepting
  proposals**, as defined below.
- **[Added]** A Job is _accepting proposals_ when **all** of the following
  hold. This was never defined in the original plan and is the single
  condition the whole submission path turns on:
  - `status = PUBLISHED`
  - `deletedAt IS NULL`
  - `proposalDeadline IS NULL` **or** `proposalDeadline` is in the future
- Draft, Cancelled, and Filled Jobs cannot receive new Proposals.
- A Provider cannot submit a Proposal to their own Job.
- A Provider cannot submit a Proposal using another user's identity.
- Only the Job owner may review Proposals for that Job.
- Only the Job owner may accept or reject a Proposal.
- Providers may only view and manage their own Proposals.
- Clients may only view Proposals belonging to their own Jobs.
- A Proposal cannot be modified after acceptance.
- A Proposal cannot be accepted after rejection.
- A Proposal cannot be accepted after withdrawal.
- A withdrawn Proposal cannot be resubmitted as the same Proposal.
- Only one Proposal can be accepted for a Job.
- Accepting one Proposal causes competing submitted Proposals to become rejected.
- Accepting a Proposal changes the associated Job to `FILLED`.
- Proposal acceptance and Job filling must occur atomically.
- A Proposal must contain all required information before submission.
- Proposal attachments must belong to the submitting Provider.
- Only uploaded Media may be attached.
- **[Added]** Attached Media is marked `PRIVATE` on attach, by the same rule
  Module 04 applies to Job attachments: visibility is decided by _where a
  file landed_, not by what the uploader declared. A proposal attachment is
  working material — a quote, a sample contract, a site photo — and is at
  least as sensitive as a client's brief.
- Deleting a Proposal must not automatically delete its Media.
- Proposal records should remain available for historical purposes after a decision.
- Proposal price and delivery information are snapshots of what the Provider offered at submission time.
- Changing a Provider's Profile or Service after submission must not modify the submitted Proposal.
- Proposal acceptance must establish the hiring relationship required by the core workflow.
- The exact Contract model is deferred to the Contracts module.
- **[Added]** Withdrawn Proposals remain visible to the Job owner, labelled as
  withdrawn. Hiding them mid-review would make a Proposal the Client had
  already read silently disappear from the list they are deciding from.

---

# Database Design

## Tables

### Proposal

Purpose

Stores a Provider's response to a Client Requirement.

Contains

- ID
- Job ID
- **[Changed]** Provider Profile ID — _only_. See the decision below.
- Cover Message
- Proposed Price
- Delivery Days
- Status
- Submitted At
- Accepted At
- Rejected At
- Withdrawn At
- Created At
- Updated At
- **[Removed]** Deleted At

Relationships

- Belongs to one Job.
- Belongs to one Provider Profile.
- Has many Proposal Attachments.

**[Changed]** The original plan stored _both_ `Provider User ID` and
`Provider Profile ID`. That is the same fact twice, and two columns that can
disagree is exactly what the Job schema avoided when it stored only
`clientProfileId` and read role through `profile.user.role`. Module 05
stores `providerProfileId` alone and resolves it from the authenticated
user's own profile — never from the request body. Ownership is therefore
still determined by authenticated identity, which was the point the original
decision was making.

**[Removed]** `deletedAt`. No endpoint deletes a Proposal — the lifecycle
ends at ACCEPTED, REJECTED or WITHDRAWN, all of which are retained on
purpose. A soft-delete column nothing writes is a column that will be
misread later as meaning something.

---

### ProposalAttachment

Purpose

Associates uploaded Media with a Proposal.

Contains

- Proposal ID
- Media ID
- Display Order
- Created At

Relationships

- Belongs to one Proposal.
- References one Media record.

The actual file is managed by the shared Media module.

```text
Proposal
   ↓
ProposalAttachment
   ↓
Media
   ↓
Object Storage
```

**[Added]** `onDelete: Restrict` on the Media relation, and
`@@unique([proposalId, mediaId])` — matching `PortfolioImage`,
`ServiceImage` and `JobAttachment`. Deleting a file still attached to a live
Proposal must fail loudly rather than silently blank it.

---

### Connection

Purpose

Represents the successful relationship created after a Client accepts a Proposal.

Contains

- ID
- Job ID
- Proposal ID
- **[Changed]** Client Profile ID
- **[Changed]** Provider Profile ID
- **[Removed]** Status
- Created At
- Updated At

**[Changed]** Client and Provider are stored as **profile** ids, for the same
reason as above and so that every party reference in the core workflow —
`Job.clientProfileId`, `Proposal.providerProfileId`, `Connection.*` — is the
same kind of id. A Connection read needs the display name and location of
both sides, which live on Profile.

**[Removed]** `ConnectionStatus`. Phase 1 only ever writes `ACTIVE`, so the
enum has exactly one member: a column whose value can be derived from the
row's existence. Closing a Connection is Contracts/Messaging work, and it
will arrive with a real second state and its own migration either way. Until
then, _a Connection row exists_ means _the relationship is active_.

Relationships

- Belongs to one Job.
- References one accepted Proposal.
- Belongs to one Client Profile.
- Belongs to one Provider Profile.

---

# ER Diagram

```text
User
 │
 ├── Client Profile
 │     └── Job
 │           ├── Proposal
 │           │     ├── Provider Profile
 │           │     └── ProposalAttachment
 │           │             └── Media
 │           │
 │           └── Connection
 │
 └── Provider Profile
       └── Proposal
```

Simplified:

```text
Job
 │
 ├── Proposal
 │      └── ProposalAttachment
 │              └── Media
 │
 └── Connection
        ├── Client Profile
        └── Provider Profile
```

---

# Prisma Requirements

Generate Prisma schema for:

- Proposal
- ProposalAttachment
- Connection

Reference existing entities:

- Profile
- Job
- Media

Requirements

- UUID primary keys
- Foreign keys
- `createdAt`
- `updatedAt`
- Appropriate lifecycle timestamps
- **[Removed]** ~~Soft delete where appropriate~~ — no Proposal is ever deleted
- Proper indexes
- Proper constraints
- Composite unique constraint on `(jobId, providerProfileId)`
- Proposal status enum
- **[Removed]** ~~Connection status enum~~
- Foreign key to accepted Proposal
- One Connection per Job — enforced by `@@unique` on **both** `jobId` and
  `proposalId`

Proposal status:

```text
SUBMITTED
ACCEPTED
REJECTED
WITHDRAWN
```

---

# Unique Constraints

The following constraint is critical:

```text
(jobId, providerProfileId)
```

must be unique.

This guarantees that one Provider cannot submit multiple Proposals for the same Job.

**[Changed]** The original plan asserted this constraint _and_, separately,
"at most one **active** Proposal per Job". Those are different rules and only
one can be true. A partial unique index (`WHERE status = 'SUBMITTED'`) would
implement the looser one, but Prisma cannot express a partial index, so it
would have to be hand-written raw SQL in the migration and would be invisible
in `schema.prisma` — a constraint the schema does not show is a constraint
someone will later violate in a query they thought was safe.

Phase 1 therefore takes the **absolute** constraint, with one consequence
stated plainly: **withdrawal is permanent for that Requirement.** A Provider
who withdraws cannot re-propose. Re-proposing is a Phase 2 concern and lands
with the partial index if it is ever genuinely wanted.

Application validation should still check this condition to return a useful
error message. The database constraint remains the final enforcement
mechanism.

---

# Indexes

At minimum:

```text
Proposal.jobId
Proposal.providerProfileId
Proposal.status
Proposal.submittedAt
```

Recommended composite indexes:

```text
(jobId, status)
(providerProfileId, status)
```

Connection:

```text
Connection.jobId          (unique)
Connection.proposalId     (unique)
Connection.clientProfileId
Connection.providerProfileId
```

**[Removed]** `Proposal.deletedAt` index — the column no longer exists.
**[Removed]** `Connection.status` index — the column no longer exists.

---

# API Endpoints

## Provider

POST /proposals

GET /proposals/me

GET /proposals/:id

POST /proposals/:id/withdraw

## Client

GET /jobs/:jobId/proposals

GET /jobs/:jobId/proposals/:proposalId

POST /proposals/:id/accept

POST /proposals/:id/reject

## Attachments

**[Added]** GET /proposals/:id/attachments

POST /proposals/:id/attachments

DELETE /proposals/:id/attachments/:attachmentId

## Connection

GET /connections/me

GET /connections/:id

**[Decision]** Connection creation is not exposed as a public POST endpoint.

It is created as part of Proposal acceptance.

This prevents clients or providers from creating fake Connections without an accepted Proposal.

---

**[Added]** Access rules the original plan left unstated:

- `GET /proposals/:id` — readable by the owning **Provider** _or_ the owner
  of the Job it targets. Anyone else gets 403. Without this rule the route
  has no defined audience, and the Client-side route below would be the only
  way a Client could read a Proposal at all.
- `GET /proposals/:id/attachments` — same audience as above, returning
  short-lived signed URLs. Module 04 serves Job attachments through their own
  authenticated route for exactly this reason: who may see a file is decided
  in one place rather than inferred from where it happens to be embedded.
  The original plan had POST and DELETE for attachments but no way to read
  them back.
- `GET /jobs/:jobId/proposals` lives in the **Proposals** module, not the
  Jobs controller, declared as `@Controller('jobs/:jobId/proposals')`. Jobs
  must not learn about Proposals; the dependency runs one way only.

---

# Proposal Submission

Provider:

```text
Provider
   ↓
Select Job
   ↓
Verify Job is accepting proposals   (status, deletedAt, proposalDeadline)
   ↓
Verify Provider is not Job owner
   ↓
Verify Provider has no existing Proposal
   ↓
Validate Proposal
   ↓
Create Proposal
   ↓
Attach uploaded Media  (marked PRIVATE)
   ↓
SUBMITTED
```

---

# Proposal Validation

Required:

- Job ID
- Cover Message
- Proposed Price
- Delivery Days

Validation:

- Job must exist
- Job must be accepting proposals (see Business Rules for the definition)
- Provider must have `PROVIDER` role
- Provider cannot own the Job
- Provider cannot already have a Proposal for the Job
- Proposed price must be non-negative
- **[Added]** Proposed price has an upper bound of 10,000,000 and at most 2
  decimal places, matching `Job.budgetMin/Max` and `Service.startingPrice`
- Delivery days must be a positive integer
- Cover message must have a maximum length
- Attachment count must have a configured maximum

**[Added]** The DTO is the field-level authorization boundary, exactly as
`CreateJobDto` is: `providerProfileId`, `status` and every lifecycle
timestamp are absent from it by design, so a request carrying them cannot
reach Prisma whatever the service layer later does with the object.

---

# Proposal Review

Client:

```text
Client
  ↓
Open Own Job
  ↓
Get Proposals
  ↓
Review Provider
  ↓
Review Price
  ↓
Review Delivery Time
  ↓
Read Cover Message
  ↓
View Attachments
```

Only the owner of the Job may access its Proposal list.

---

# Accept Proposal

The acceptance operation is the most important transaction in Module 05.

```text
Client
  ↓
Accept Proposal
  ↓
BEGIN TRANSACTION
  │
  ├── Job → FILLED, conditional on status = PUBLISHED
  │      └── 0 rows updated ⇒ 409, roll back
  │
  ├── Verify Proposal is SUBMITTED
  │
  ├── Proposal → ACCEPTED
  │
  ├── Other SUBMITTED proposals → REJECTED
  │
  └── Connection created
  │
COMMIT
```

All changes must succeed or none should be committed.

---

# Concurrent Acceptance

This must be handled at the database level.

Example:

```text
Client opens Proposal A
Client opens Proposal B

Request 1 → Accept A
Request 2 → Accept B
```

The system must never produce:

```text
A = ACCEPTED
B = ACCEPTED
Job = FILLED
```

Exactly one Proposal may win.

**[Added]** The mechanism, named here so it is not re-derived at
implementation time:

```ts
// inside one interactive transaction
const claimed = await tx.job.updateMany({
  where: { id: jobId, status: 'PUBLISHED', deletedAt: null },
  data: { status: 'FILLED' },
});
if (claimed.count === 0) throw new ConflictException('This requirement has already been filled.');
```

The conditional `updateMany` **is** the lock: Postgres serialises the two
writers on the row, and the second one matches zero rows because the status
it required is no longer there. No `SELECT ... FOR UPDATE` and no advisory
lock is needed, and the claim happens _first_ in the transaction so nothing
else has been written when the loser rolls back.

`@@unique` on `Connection.jobId` is the backstop: even if the ordering above
were ever broken, the database still refuses a second Connection for the
same Job.

The losing request receives:

```text
409 Conflict

This requirement has already been filled.
```

---

# Reject Proposal

Client:

```text
POST /proposals/:id/reject
```

Requirements:

- Authenticated Client
- Client owns the Proposal's Job
- Proposal status is `SUBMITTED`

Transition:

```text
SUBMITTED
    ↓
REJECTED
```

Rejected Proposals cannot later be accepted.

**[Decision]** No rejection reason field. Phase 1 has no Notifications module
to deliver one and no screen to show it, so it would be write-only data. When
Notifications exists, a reason column arrives with something that reads it.

---

# Withdraw Proposal

Provider:

```text
POST /proposals/:id/withdraw
```

Requirements:

- Authenticated Provider
- Provider owns Proposal
- Proposal status is `SUBMITTED`

Transition:

```text
SUBMITTED
    ↓
WITHDRAWN
```

A withdrawn Proposal cannot later be accepted, and — see "Unique
Constraints" — cannot be replaced by a new Proposal for the same Requirement.

---

# Connection

A Connection is established only when:

```text
Proposal
    ↓
ACCEPTED
```

Then:

```text
Job
 ↓
FILLED

Proposal
 ↓
ACCEPTED

Connection
 ↓
created
```

The Connection must reference the accepted Proposal.

This provides a durable bridge for future:

- Messaging
- Contracts
- Payments
- Notifications

**[Changed]** This settles the open question recorded in `status.md`: a
Connection **is its own row**, not merely "a Proposal in the accepted state".
The reason is that everything downstream hangs off the relationship rather
than off the offer — a conversation, a contract and a payment all belong to
_these two parties for this job_, and a Proposal is the wrong thing for them
to key on, because its row is a historical record of what was offered.

---

# Security

- Authenticated access required for Proposal mutations.
- `PROVIDER` role required to create Proposals.
- `CLIENT` role required to accept/reject Proposals.
- Provider ownership validated for every Provider-side mutation.
- Job ownership validated for every Client-side decision.
- Providers cannot access another Provider's private Proposal data.
- Clients cannot access Proposals for another Client's Job.
- Providers cannot submit Proposals as another Provider.
- Providers cannot set `providerProfileId` from the request body.
- Clients cannot directly modify Proposal status.
- Clients cannot directly create Connections.
- Status transitions are controlled by the server.
- Accepted Proposals cannot be modified.
- Rejected Proposals cannot be accepted.
- Withdrawn Proposals cannot be accepted.
- Proposals cannot be submitted against unavailable Jobs.
- Duplicate Proposals are prevented by a database unique constraint.
- Proposal attachments must belong to the Provider.
- Pending/failed/deleted Media cannot be attached.
- **[Added]** Attached Media is marked `PRIVATE`, and attachment URLs are
  short-lived signed URLs issued by an authenticated route — never served
  from storage directly.
- DTOs use explicit allowlisted fields.
- Never bind request bodies directly to Prisma models.
- Parameterized database queries only.
- XSS-safe handling of Proposal messages.
- Rate limiting should apply to Proposal creation and decision endpoints.
  **[Added]** Note: the application's throttler is in-memory and is a known,
  inherited gap — it works on one instance and silently stops working on two.
  Module 05 does not fix it and does not make it worse.
- UUIDs must not be treated as authorization.
- Concurrent Proposal acceptance must be transactionally safe.

---

# State Transition Rules

Valid transitions:

```text
SUBMITTED
 ├──→ ACCEPTED
 ├──→ REJECTED
 └──→ WITHDRAWN
```

Invalid transitions:

```text
ACCEPTED  → REJECTED
ACCEPTED  → WITHDRAWN

REJECTED  → ACCEPTED
REJECTED  → WITHDRAWN

WITHDRAWN → ACCEPTED
WITHDRAWN → REJECTED
```

These must be rejected server-side.

**[Added]** Expressed as one `ALLOWED_TRANSITIONS` table in the service, the
same shape `JobsService` uses, so an invalid transition cannot be reached by
adding a code path and forgetting a guard.

---

# Folder Structure

```text
proposals/
  controllers/
  services/
  repositories/
  dto/
  tests/
```

Matching `jobs/` exactly.

---

# Dependency Matrix

| Module      | Depends On                      | Used By                          |
| ----------- | ------------------------------- | -------------------------------- |
| Identity    | User, JWT, roles                | Proposal authorization           |
| Profiles    | Profile                         | Provider and Client identity     |
| Marketplace | —                               | —                                |
| Media       | Media                           | Proposal attachments             |
| Jobs        | Job, `JobsService.claimFilled`  | Proposal target                  |
| Proposals   | Jobs, Profiles, Media, Identity | Connection, Contracts, Messaging |

**[Changed]** Marketplace is not a dependency. Module 05 never resolves a
category or a service — it reads a Job, which has already done that.

**[Added]** `JobsService` is imported from `JobsModule`, which already
exports it for this purpose. Jobs does not import Proposals; the arrow points
one way.

---

# Module Events

Documented for future design only.

Intended events:

- ProposalSubmitted
- ProposalWithdrawn
- ProposalAccepted
- ProposalRejected
- ConnectionEstablished

No event bus is implemented in Phase 1.

These events are future integration points for:

- Notifications
- Messaging
- Contracts
- Payments
- Analytics

---

# Implementation Order

1. Review existing Profile / Job / Media schemas
2. Finalize Proposal fields
3. Prisma schema
4. Migration
5. Proposal repository
6. Proposal service
7. Proposal creation
8. Proposal validation
9. Proposal listing (provider's own, and the Job owner's list)
10. Proposal withdrawal
11. Proposal rejection
12. Proposal acceptance transaction
13. Connection creation
14. Proposal attachments (attach, detach, read with signed URLs)
15. Authorization tests
16. Concurrency tests — **[Changed]** API-level, not Playwright
17. Playwright integration (accept, reject, cross-provider 403)
18. Swagger documentation
19. `status.md` entry

---

# Test Cases

## Proposal Creation

- Provider submits Proposal
- Client attempts to submit Proposal → 403
- Unauthenticated user submits → 401
- Missing Job → 404
- Job is a draft / cancelled / filled → 409
- **[Added]** Job's `proposalDeadline` has passed → 409
- Provider owns Job → 403
- Duplicate Proposal → 409
- **[Added]** Second Proposal after withdrawing the first → 409, with a
  message that says withdrawal was final
- Invalid price → 400
- Invalid delivery days → 400
- Invalid message → 400

## Proposal Ownership

- Provider views own Proposal
- Provider withdraws own Proposal
- Provider attempts to view another Provider's Proposal → 403
- Provider attempts to withdraw another Provider's Proposal → 403
- Client cannot modify Provider's Proposal directly

## Client Review

- Client views Proposals for own Job
- Client views individual Proposal for own Job
- Client attempts to view another Client's Job's Proposals → 403
- **[Added]** Withdrawn Proposals still appear in the Job owner's list

## Proposal Decisions

- Client accepts Proposal
- Client rejects Proposal
- Non-owner Client attempts acceptance → 403
- Provider attempts acceptance → 403
- Accepted Proposal cannot be rejected
- Rejected Proposal cannot be accepted
- Withdrawn Proposal cannot be accepted
- Filled Job cannot accept another Proposal

## Concurrent Acceptance

**[Changed]** These run at the API level with two requests fired together,
not through a browser — Playwright cannot reliably produce simultaneity, and
a concurrency test that quietly runs sequentially passes while proving
nothing.

- Two Proposals submitted
- Two simultaneous acceptance requests
- Exactly one Proposal becomes ACCEPTED
- Remaining Proposal becomes REJECTED
- Job becomes FILLED
- Exactly one Connection is created
- Losing request receives 409
- No partial transaction state

## Connection

- Accepted Proposal creates Connection
- Connection references correct Job
- Connection references correct Proposal
- Connection references correct Client
- Connection references correct Provider
- Duplicate Connection prevented

## Attachments

- Provider attaches uploaded Media
- Provider cannot attach another user's Media
- Client cannot attach Media to Provider Proposal
- Pending Media cannot be attached
- Deleted Media cannot be attached
- Duplicate attachment prevented
- Attachment deletion does not delete Media automatically
- **[Added]** Job owner can read a Proposal's attachments; an unrelated user
  cannot
- **[Added]** Attached Media becomes `PRIVATE`

## Security

- IDOR attempt on Proposal → 403
- IDOR attempt on Job Proposal list → 403
- Provider spoofing another Provider → rejected
- Provider attempts to set `providerProfileId` in the body → stripped by the DTO
- Client attempts to force ACCEPTED status → stripped by the DTO
- Client attempts to create Connection directly → no such route
- Invalid state transition → 409
- Duplicate Proposal → 409
- SQL injection safely handled
- XSS payload safely handled

---

# Deliverables

The implementation must include:

✓ Prisma Schema

✓ Database Migration

✓ Repository Layer

✓ Service Layer

✓ Controller Layer

✓ DTO Validation

✓ Proposal Creation

✓ Proposal Listing

✓ Proposal Withdrawal

✓ Proposal Rejection

✓ Proposal Acceptance

✓ Connection Establishment

✓ Proposal Attachments

✓ Ownership Validation

✓ RBAC Validation

✓ Transactional Acceptance

✓ Concurrency Tests

✓ Unit Tests

✓ Playwright Integration Tests

✓ API Documentation

---

# Deliberately Not Built

**[Added]** Each of these was in the original plan and is dropped for a
stated reason, rather than missed:

- **Administrator moderation endpoints** — no admin module exists. Same call
  Module 04 made.
- **`Connection.status`** — a one-member enum. See the Connection table.
- **Proposal soft delete** — nothing deletes a Proposal.
- **Rejection reason** — nothing would read it until Notifications exists.
- **Re-proposing after withdrawal** — needs a partial unique index Prisma
  cannot express. Phase 2.

---

# Future Enhancements

Deferred until future phases.

- Proposal Drafts
- Proposal Editing
- Proposal Versioning
- Counter Offers
- Negotiation
- Re-proposing after withdrawal
- AI Proposal Generation
- AI Proposal Ranking
- Personalized Proposal Ranking
- Proposal Recommendations
- Proposal Analytics
- Automatic Proposal Matching
- Contracts
- Payments
- Escrow
- Messaging
- Notifications
- Dispute Resolution

---

# Acceptance Criteria

The module is considered complete when:

- Providers can submit Proposals to eligible Requirements.
- A Provider can submit at most one Proposal per Requirement.
- Providers can view their own Proposals.
- Providers can withdraw eligible Proposals.
- Clients can view Proposals for their own Requirements.
- Clients can accept a Proposal.
- Clients can reject a Proposal.
- Only the Requirement owner can make Proposal decisions.
- Only one Proposal can be accepted for a Requirement.
- Accepting a Proposal marks the Job as `FILLED`.
- Competing submitted Proposals become `REJECTED`.
- An accepted Proposal creates exactly one Connection.
- Concurrent acceptance cannot create multiple winners.
- Proposal attachments use the shared Media pipeline and are private.
- Unauthorized users cannot access or modify Proposal data.
- Invalid Proposal state transitions are rejected.
- Prisma migrations succeed against the hosted database.
- All unit tests pass.
- Core Playwright flow passes.
- APIs are documented.

---

# Core Playwright Workflow

The most important end-to-end test is:

```text
CLIENT
  ↓
Create Requirement
  ↓
Publish Requirement
        ↓
PROVIDER
  ↓
Browse Requirements
  ↓
Open Requirement
  ↓
Submit Proposal
        ↓
CLIENT
  ↓
Open Requirement
  ↓
View Proposal
  ↓
Accept Proposal
        ↓
SYSTEM
  ↓
Proposal = ACCEPTED
  ↓
Job = FILLED
  ↓
Connection created
```

A second test should verify rejection:

```text
Provider
  ↓
Submit Proposal
  ↓
Client
  ↓
Reject Proposal
  ↓
Proposal = REJECTED
```

A critical security test:

```text
Provider A
  ↓
Submit Proposal

Provider B
  ↓
Attempts to modify Proposal A
  ↓
403
```

**[Removed]** The concurrency scenario is no longer a Playwright test. It
moved to the API-level suite — see "Concurrent Acceptance" above.

---

# Known Gaps / Pending UI Changes

These are deliberate Phase 1 boundaries.

- **Proposal editing is deferred.** Once submitted, the Proposal is immutable except for withdrawal. This avoids versioning and race conditions in the initial workflow.

- **Proposal drafts are deferred.** Providers submit complete Proposals in one operation.

- **Negotiation is deferred.** There is no counter-offer or price negotiation state.

- **Connection is intentionally minimal.** Phase 1 establishes the relationship and nothing more. Contracts, Messaging, Payments, and Notifications will consume it later.

- **Private Proposal attachments depend on the Media pipeline.** The Proposal module references Media rather than implementing its own upload mechanism — and inherits that pipeline's own known gap: **no upload has ever been verified against real storage**, because `STORAGE_*` is unset. Authorization around attachments is testable; the upload path itself is not, until R2 or MinIO exists.

- **Proposal ranking is not implemented.** Clients receive Proposals without AI or behavioral ranking.

- **Notifications are deferred.** Proposal submission, acceptance, and rejection are represented through application state until the Notifications module exists. A Provider learns they were rejected by looking.

- **Contract creation is deferred.** Accepting a Proposal establishes the Connection but does not create a Contract.

- **Withdrawal is permanent for that Requirement.** A consequence of the unique constraint, not an oversight.

---

# Module Boundary

```text
MODULE 04 — JOBS
────────────────────────

Client
  ↓
Create Requirement
  ↓
Publish Requirement
  ↓
Provider discovers Requirement


MODULE 05 — PROPOSALS
────────────────────────

Provider
  ↓
Submit Proposal
  ↓
Client reviews Proposals
  ↓
Accept / Reject
  ↓
Connection Established


FUTURE MODULES
────────────────────────

Connection
  ↓
Messaging
  ↓
Contract
  ↓
Payment
  ↓
Review
  ↓
Notifications
```

The core workflow is therefore:

```text
Identity
   ↓
Profiles
   ↓
Marketplace
   ↓
Jobs / Requirements
   ↓
Proposals
   ↓
Connection
```

That is the complete Phase 1 transactional path for the core Marche marketplace workflow.

---

<!-- ============================================================ -->
<!-- [Module 5] SUMMARY OF REVISIONS — added during plan review   -->
<!-- ============================================================ -->

# Revisions to the Original Plan

Every departure from the plan as first written, in one place.

### Contradictions resolved

1. **`(jobId, providerId)` unique vs "one _active_ proposal per job".** Took
   the absolute constraint. Withdrawal is permanent for that Requirement.
2. **Provider User ID _and_ Provider Profile ID.** Kept `providerProfileId`
   only, matching `Job.clientProfileId`. Same for both sides of Connection.
3. **`deletedAt` on Proposal vs "records remain available".** Removed — no
   endpoint deletes a Proposal.
4. **`ConnectionStatus` with one member.** Removed. A Connection row existing
   is what "active" means.

### Gaps filled

5. **"Accepting proposals" is now defined** — `PUBLISHED` + not deleted +
   deadline not passed. Module 04 added `proposalDeadline` for exactly this
   and the plan never referenced it.
6. **`GET /proposals/:id/attachments` added** — the plan could attach and
   detach files but never read them back.
7. **Attachments are marked `PRIVATE`** on attach, matching Module 04.
8. **Audience defined for `GET /proposals/:id`** — owning Provider or Job
   owner.
9. **Withdrawn proposals stay visible** to the Job owner, labelled.
10. **No rejection reason**, stated as a decision rather than left silent.

### Mechanisms named up front

11. **Concurrent acceptance** uses a conditional `updateMany` on the Job as
    the claim, first in the transaction, with `@@unique(Connection.jobId)` as
    the backstop.
12. **Concurrency tests moved out of Playwright** to the API-level suite.
13. **`GET /jobs/:jobId/proposals` is declared in the Proposals module**, so
    Jobs never learns about Proposals.
14. **Marketplace dropped from the dependency matrix** — Module 05 never
    touches categories or services.
