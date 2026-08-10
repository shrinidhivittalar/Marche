# Marché Architecture

> Version: 1.3.0
>
> Status: Draft
>
> Last Updated: 2026-08-10
>
> **[Updated]** Changelog from 1.2.0 (minor): Section 7's single "Jobs"
> module split into "Jobs" and "Proposals", reconciled with
> docs/modules/module5.md. Section 8 "Module Interaction" gains the
> Connection and states the direction of the Jobs↔Proposals dependency.
> Section 12 "File Storage" gains the private-attachment rule the media
> pipeline actually implements. ADR-006 added for the concurrent-acceptance
> mechanism. Module 04 shipped without a version bump of its own, so its
> reconciliation lands here too. No other section changed.
>
> **[Updated]** Changelog from 1.1.0 (minor): "Marketplace" module
> responsibilities reconciled with docs/modules/module3.md — discovery,
> search, and visibility enforcement named explicitly, and the module's
> read-only dependency on Profiles recorded. No other section changed.
>
> **[Updated]** Changelog from 1.0.0 (minor): Section 7 "Profiles" reconciled
> with docs/modules/module2.md — single shared `Profile` table instead of
> separate Provider/Client Profile concepts. No other section changed.

---

# 1. Purpose

This document defines the overall software architecture of Marché.

Its purpose is to establish a clear technical foundation before implementation begins. Rather than focusing on code or database implementation, this document explains how the system is organized, why architectural decisions were made, and how different modules interact.

The architecture described in this document is intentionally focused on Phase 1 of the project while keeping future expansion in mind.

---

# 2. Product Vision

Marché is a service marketplace that connects clients with service providers across multiple industries.

The platform enables clients to discover professionals, publish jobs, receive proposals, communicate, establish contracts, complete payments, and build trust through reviews.

The goal of Phase 1 is to build a production-ready marketplace similar in workflow to platforms such as Upwork while maintaining a clean architecture that can evolve as business requirements grow.

---

# 3. Scope

## Included in Phase 1

- User Registration
- Authentication
- User Profiles
- Service Listings
- Service Discovery
- Job Posting
- Proposal Submission
- Contract Creation
- Messaging
- Payments
- Reviews
- Notifications

## Excluded from Phase 1

- Multi-tenancy
- White-label deployments
- Organizations
- Team workspaces
- Action-based permissions
- Escrow
- Wallets
- Payouts
- AI features
- Advanced analytics
- Microservices

---

# 4. Architectural Principles

The architecture follows the following principles:

## Modularity

Each business capability is implemented as an independent module.

Examples:

- Identity
- Marketplace
- Jobs
- Contracts
- Messaging

Each module owns its own business logic.

---

## Separation of Concerns

The frontend, backend, business logic and persistence layers remain independent.

No business logic should exist inside UI components.

---

## Business Driven Design

The database is designed around business entities instead of user interface screens.

Examples:

✓ Job

✓ Proposal

✓ Contract

Not:

✗ Dashboard

✗ HomePage

---

## Simplicity First

Only features required by the business are implemented.

Future scalability is considered during design but not implemented until required.

---

## Extensibility

Every module should allow future enhancements without major redesign.

Examples include:

- Organizations
- Multi-tenancy
- Action-based permissions
- White-label deployments

---

# 5. High-Level Architecture

```
                React Application
                       │
                       │
                 REST API (NestJS)
                       │
      ┌────────────────┼────────────────┐
      │                │                │
 Identity       Marketplace       Messaging
      │                │                │
      ├────────────┬───┴───────────────┤
                   │
                 Prisma
                   │
             PostgreSQL
                   │
        File Storage (S3 / R2)
```

---

# 6. Technology Stack

## Frontend

- React
- TypeScript
- Vite

## Backend

- NestJS
- TypeScript

## Database

- PostgreSQL

## ORM

- Prisma

## Authentication

- JWT
- Refresh Tokens

## File Storage

- Cloudflare R2 / Amazon S3

---

# 7. System Modules

## Identity

Responsible for:

- Registration
- Login
- Authentication
- Session Management

---

## Profiles

Responsible for:

- Profile management — **[Updated]** one shared `Profile` table per User, covering both Client and Provider roles, instead of separate "Provider Profiles" / "Client Profiles". See docs/modules/module2.md.
- Portfolio Management — **[Updated]** Provider-only.
- Skills — **[Updated]** Provider-only.
- Experience, Education, Certifications, Languages — **[New]**, Provider-only.
- Availability — **[New]**, Provider-only.
- Verified badge — **[New]** a lightweight, system-computed badge (e.g. based on email verification + completed jobs), not identity/KYC verification. Real identity verification (KYC) remains excluded from Phase 1 per phase_scope1.1.0.md and is planned as a later module.

---

<!-- ============================================================ -->
<!-- [Module 3 — Marketplace] SECTION UPDATED IN 1.2.0           -->
<!-- Reconciled against docs/modules/module3.md.                  -->
<!-- Changes start here and end at the "Jobs" heading.            -->
<!-- ============================================================ -->

## Marketplace

Responsible for:

- Categories — **[Updated]** hierarchical, two levels, admin-managed.
- Services
- Service Discovery
- Provider Discovery — **[New]** deduplicated provider results derived from matching services.
- Search, Filtering, Sorting, Pagination — **[New]**
- Marketplace Visibility Enforcement — **[New]** the module owns the single shared filter that decides what is publicly discoverable.

Not responsible for:

- Provider identity or professional data — read from Profiles, never written. **[New]**
- Ratings and review counts — owned by the Reviews module, unavailable in Phase 1. **[New]**

Architectural note: **[New]** Marketplace is the first module that reads
another module's tables (Profile, Skill) rather than owning everything it
serves. It reads them by Prisma relation and treats them as read-only.
This keeps one source of truth for professional data rather than
denormalising a copy into the marketplace that would then need syncing.

<!-- [Module 3 — Marketplace] SECTION UPDATE ENDS HERE -->

---

<!-- ============================================================ -->
<!-- [Module 4 — Jobs / Module 5 — Proposals]                     -->
<!-- SECTION UPDATED IN 1.3.0                                     -->
<!-- One "Jobs" module became two. Reconciled against              -->
<!-- docs/modules/module5.md and what Module 04 shipped.           -->
<!-- Changes start here and end at the "Contracts" heading.        -->
<!-- ============================================================ -->

## Jobs

Responsible for:

- Job Posting
- Requirement Lifecycle — **[New]** draft, published, filled, cancelled.
- Requirement Discovery — **[New]** the provider-facing search, filter and
  sort over published requirements, and the single visibility filter that
  decides which ones are publicly readable.
- Private Job Attachments — **[New]**

Not responsible for:

- Proposal Submission — **[Updated]** moved to the Proposals module below.
- Marking a requirement `FILLED` **as a client action** — **[New]** the
  transition exists (`JobsService.markFilled`) and is exported, but there is
  no route to it. It is the consequence of accepting a proposal, so it
  belongs to the workflow that accepts one; a client declaring their own job
  filled would let the two sides of the same hire disagree.

Architectural note: **[New]** Jobs knows nothing about Proposals. The
dependency runs one way — Proposals imports `JobsService`, Jobs imports
nothing from Proposals — which is why the client's proposal list
(`GET /jobs/:jobId/proposals`) is declared inside the Proposals module even
though its path sits under `/jobs`.

---

## Proposals **[New]**

Responsible for:

- Proposal Submission
- Proposal Lifecycle — submitted, accepted, rejected, withdrawn
- Proposal Review by the requirement's owner
- The Hiring Decision — accept and reject
- Private Proposal Attachments
- Connection Establishment

Not responsible for:

- Requirements — read from Jobs, and mutated only through the one exported
  transition (`markFilled`).
- Provider identity or professional data — read from Profiles, never written.
- Contracts, messaging, payments — these consume the Connection later; the
  Connection itself carries no workflow.

Architectural note: acceptance is the first genuinely transactional operation
in the codebase. Four writes — the job, the accepted proposal, the losing
proposals, the connection — either all land or none do. See ADR-006.

<!-- [Module 4 / Module 5] SECTION UPDATE ENDS HERE -->

---

## Contracts

Responsible for:

- Accepted Proposals
- Project Tracking
- Milestones

---

## Messaging

Responsible for:

- Conversations
- Messages
- Attachments

---

## Payments

Responsible for:

- Transaction Records
- Payment Status

---

## Reviews

Responsible for:

- Ratings
- Feedback

---

## Notifications

Responsible for:

- System Notifications
- User Alerts

---

# 8. Module Interaction

The primary business flow of the application is:

```
User
    │
Profile
    │
Service
    │
Job
    │
Proposal
    │
Connection          ← [New in 1.3.0]
    │
Contract
    │
Payment
    │
Review
```

Each module communicates only through well-defined APIs.

Modules should never directly manipulate another module's internal business logic.

**[New]** Dependency directions, stated so they cannot quietly reverse:

```
Proposals ──reads──→ Jobs, Profiles, Media
Proposals ──calls──→ JobsService.markFilled   (the only write it makes outside its own tables)
Jobs      ──────────→ (nothing in Proposals)
```

The Connection is the hand-off point out of the core workflow. Everything
after it — messaging, contracts, payments — keys on the relationship rather
than on the proposal, because a proposal row is a historical record of what
was offered, not a live thing two parties act through.

---

# 9. Backend Architecture

The backend follows a layered architecture.

```
Controllers
      │
Services
      │
Repositories (Prisma)
      │
Database
```

Responsibilities:

### Controllers

Receive HTTP requests.

Perform validation.

Return HTTP responses.

---

### Services

Contain business logic.

Coordinate workflows.

Enforce domain rules.

---

### Repositories

Interact with Prisma.

Contain database operations only.

---

### Database

Responsible only for persistence.

No business logic.

---

# 10. Database Architecture

The system uses PostgreSQL as the primary relational database.

Key principles:

- UUID Primary Keys
- Foreign Keys
- Normalized Design
- Soft Deletes where appropriate
- Automatic timestamps
- ACID Transactions

The detailed schema is documented separately in `database.md`.

---

# 11. Authentication Architecture

Phase 1 supports:

- Email
- Password

Authentication Flow:

```
Register

↓

Email Verification

↓

Login

↓

JWT

↓

Refresh Token

↓

Authenticated Requests
```

OAuth providers such as Google and LinkedIn remain future enhancements.

---

# 12. File Storage

External object storage is used for:

- Profile Images
- Portfolio Images
- Service Images
- Attachments

Binary files are never stored directly inside PostgreSQL.

Only metadata is stored in the database. **[Updated]** Not URLs: the database
stores an `objectKey`, and a URL is signed from it at read time, so changing
bucket or provider never means rewriting rows.

**[New]** Visibility is decided by _where a file lands_, not by what the
uploader declared. A portfolio photo is advertising and is meant to be seen;
a job or proposal attachment is working material — a brief, a floor plan, a
quote — and is marked `PRIVATE` when it is attached. Nothing is served
straight from storage in either case: every URL is short-lived and signed by
a route that has already decided the caller may see the thing the file hangs
off.

---

# 13. Search

Phase 1

- PostgreSQL Search

Future

- OpenSearch / Elasticsearch

---

# 14. Security

The system follows the following security principles:

- Password Hashing
- HTTPS
- JWT Authentication
- Refresh Tokens
- Input Validation
- Authorization
- Rate Limiting
- Secure File Uploads

---

# 15. Error Handling

Errors are categorized as:

- Validation Errors
- Authentication Errors
- Authorization Errors
- Business Rule Violations
- Unexpected Server Errors

Each category returns consistent API responses.

---

# 16. Logging

Phase 1 logging includes:

- Application Logs
- Error Logs
- Audit Logs — **[Updated]** built ahead of schedule as part of the Identity module (generic, cross-module `audit_logs` table — see apps/api/src/audit), not deferred to a future phase as originally noted here.

Future phases may introduce:

- Security Logs (dedicated monitoring/alerting, e.g. Sentry — see tech_stack1.0.0.md)

---

# 17. Architectural Decisions (ADRs)

## ADR-001

Decision

Use PostgreSQL instead of MongoDB.

Reason

The marketplace contains highly relational business entities including Jobs, Proposals, Contracts, Reviews and Payments.

A relational database provides stronger consistency, transactions and referential integrity.

---

## ADR-002

Decision

Use Prisma ORM.

Reason

Prisma provides type-safe database access, schema management and automatic migrations while maintaining PostgreSQL as the source of truth.

---

## ADR-003

Decision

Use a Modular Monolith.

Reason

The current project scope and team size do not justify microservices.

Future modules can be extracted independently if necessary.

---

## ADR-004

Decision

Single-Tenant Architecture.

Reason

The current business objective is to build a single marketplace similar to Upwork.

The architecture should remain flexible enough to support future multi-tenancy if business requirements change.

---

## ADR-005

Decision

Business-first design.

Reason

Business entities and workflows will drive database design instead of UI implementation.

---

<!-- [Module 5 — Proposals] ADR-006 ADDED IN 1.3.0 -->

## ADR-006 **[New]**

Decision

Serialise concurrent proposal acceptance with a conditional update inside a
transaction, rather than a row lock, an advisory lock, or a queue.

Reason

Two clicks on "accept" for two different proposals on the same requirement
must produce exactly one winner. Inside one interactive transaction, the
first statement claims the job:

```
UPDATE jobs SET status = 'FILLED' WHERE id = ? AND status = 'PUBLISHED'
```

Postgres serialises the two writers on that row, and the loser matches zero
rows because the status it required is no longer there — it gets a 409 and
rolls back having written nothing, because the claim is the first statement.
A unique constraint on `Connection.jobId` is the backstop if that ordering is
ever broken.

`SELECT ... FOR UPDATE` would work equally well and adds a statement and a
lock to reason about. A queue would add infrastructure this application does
not have, for a race that resolves in one round trip.

---

# 18. Future Evolution

The following capabilities are intentionally deferred:

- Organizations
- Enterprise Teams
- Action-based Permissions (RBAC)
- White-label Deployments
- Multi-tenancy
- Escrow
- Wallets
- AI Recommendations
- AI Marketplace Assistant
- Advanced Analytics
- Microservices
- Identity Verification (KYC) — **[New]** real document/ID verification, distinct from the lightweight "Verified" badge built in Phase 1. Planned as a later module (see docs/modules/module2.md's Profile Verification Status note).

---

# 19. Related Documents

- `database.md`
- `domain-rules.md`
- `identity.md`
- `profiles.md`
- `marketplace.md`
- `jobs.md`
- `contracts.md`
- `messaging.md`
- `payments.md`
- `reviews.md`
- `notifications.md`

These documents provide implementation-level details for each module and should be considered extensions of this architecture document.
