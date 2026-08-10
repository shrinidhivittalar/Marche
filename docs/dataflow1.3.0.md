# Data Flow

> Version: 1.3.0
>
> Status: Draft
>
> Last Updated: 2026-08-10
>
> **[Updated]** Changelog from 1.2.0 (minor): Flow #10 "Submit Proposal" and
> Flow #11 "Accept Proposal" reconciled with docs/modules/module5.md.
> Submission now names the eligibility checks it actually performs and drops
> the notification step (no Notifications module exists). Acceptance is
> rewritten as the transaction it is, creating a Connection rather than a
> Contract and a Conversation, neither of which Phase 1 builds. The "Job" and
> "Proposal" entity lifecycles corrected to the states the schema really has.
> No other flow changed.
>
> **[Updated]** Changelog from 1.1.0 (minor): Flow #6 "Publish Service"
> and Flow #7 "Browse & Search Services" reconciled with
> docs/modules/module3.md. Image upload removed from the publish flow
> (ServiceImage is deferred); skill selection and visibility added. The
> search flow now names the visibility filter and the provider-discovery
> path explicitly, since "Database Search" hid the single most important
> rule in the module. No other flow changed.
>
> **[Updated]** Changelog from 1.0.0 (minor): Flow #5 "Create Profile"
> database reference reconciled with docs/modules/module2.md (single
> `Profile` table, not separate Provider/Client tables). "Audit Logging"
> moved out of "Future Flows (Out of Scope)" — it was built in Phase 1 as
> part of the Identity module, ahead of the original schedule. No other
> flow changed.

---

# Purpose

This document describes how data flows throughout the Marché platform during Phase 1.

Unlike the database schema, which defines what data is stored, this document explains how information moves between users, business modules, APIs and the database.

Each flow represents a complete business workflow rather than individual API calls.

The objective is to ensure every business process is clearly understood before implementation begins.

---

# Guiding Principles

- Every business workflow should have a clearly defined start and end.
- Modules communicate only through well-defined APIs.
- Business logic belongs to backend services.
- Data should flow in a predictable and consistent manner.
- Every workflow should enforce the domain rules defined in `domain-rules.md`.

---

# Phase 1 Business Flows

The following workflows represent the core business functionality of the marketplace.

1. User Registration
2. Email Verification
3. User Login
4. Password Reset
5. Profile Creation
6. Create Service
7. Browse Services
8. Search Services
9. Create Job
10. Browse Jobs
11. Submit Proposal
12. Accept Proposal
13. Create Contract
14. Messaging
15. Payment
16. Submit Review
17. Notification Generation

---

# 1. User Registration

## Goal

Allow new users to create an account.

## Trigger

User selects "Create Account".

## Flow

```
User

↓

Registration Form

↓

Frontend Validation

↓

Identity API

↓

User Validation

↓

Password Hashing

↓

User Created

↓

Verification Token Generated

↓

Email Service

↓

Registration Successful
```

## Modules

- Identity

## Database

- User
- VerificationToken

## Business Rules

- Email must be unique.
- Password must be securely hashed.
- Verification email must be generated.
- User cannot access protected features until verification.

---

# 2. Email Verification

## Goal

Verify ownership of the user's email.

## Trigger

User clicks verification link.

## Flow

```
Email Link

↓

Verification API

↓

Validate Token

↓

Update User Status

↓

Token Deleted

↓

Account Activated
```

## Modules

- Identity

## Database

- User
- VerificationToken

---

# 3. User Login

## Goal

Authenticate existing users.

## Trigger

User submits login credentials.

## Flow

```
User

↓

Login Form

↓

Identity API

↓

Validate Email

↓

Verify Password

↓

Generate JWT

↓

Create Session

↓

Return Access Token

↓

Authenticated User
```

## Modules

- Identity

## Database

- User
- Session

## Business Rules

- User must exist.
- Password must match.
- User must not be suspended.
- Session must be created.

---

# 4. Password Reset

## Goal

Allow users to securely reset forgotten passwords.

## Flow

```
Forgot Password

↓

Generate Reset Token

↓

Email User

↓

User Clicks Link

↓

Validate Token

↓

New Password

↓

Password Updated
```

---

# 5. Create Profile

## Goal

Allow users to complete their marketplace profile.

## Flow

```
User

↓

Profile Form

↓

Upload Profile Image

↓

Save Profile

↓

Profile Completed
```

## Modules

- Profiles

## Database

- Profile — **[Updated]** single table shared by both Client and Provider roles (was "ProviderProfile / ClientProfile"), per docs/modules/module2.md.

---

<!-- ============================================================ -->
<!-- [Module 3 — Marketplace] FLOWS 6 AND 7 UPDATED IN 1.2.0     -->
<!-- Reconciled against docs/modules/module3.md.                  -->
<!-- Changes start here and end at the "8." heading.              -->
<!-- ============================================================ -->

# 6. Publish Service

## Goal

Allow providers to publish services.

## Flow

```
Provider

↓

Create Service

↓

Select Category

↓

Add Skills

↓

Validation

↓

Save Service

↓

Set Visibility

↓

Marketplace Updated
```

**[Updated]** "Upload Images" removed from this flow — ServiceImage is
deferred out of Phase 1 (see phase_scope1.2.0.md). "Select Category",
"Add Skills", and "Set Visibility" added: a service is not discoverable
until it is both `PUBLISHED` and attached to a category.

## Modules

- Marketplace

## Database

- Service
- Category
- ServiceSkill — **[New]**
- Skill — **[New]** read-only reference, owned by the Profile module.

## Business Rules

- Only Providers may publish services.
- Service must belong to a category.
- Skills must reference predefined Skill rows. **[New]**
- Only `PUBLISHED` services reach the marketplace. **[New]**

---

# 7. Browse & Search Services

## Goal

Allow clients to discover services and providers.

## Flow

```
Client

↓

Search / Filters

↓

Marketplace API

↓

Apply Visibility Filter

↓

Database Search

↓

Sort + Paginate

↓

Matching Services   ──or──   Deduplicated Providers

↓

Results Displayed
```

**[Updated]** The visibility filter is now a named step rather than being
implicit inside "Database Search". It is the single most important rule in
the module and lives in one shared repository method: a result is returned
only if the service is `PUBLISHED` and not soft-deleted, **and** the owning
profile is `PUBLIC` and not soft-deleted, **and** the owning user is
`ACTIVE`. **[New]** The flow forks at the end because the same query path
serves both service results and deduplicated provider results.

## Modules

- Marketplace
- Profiles — read-only source of provider display data, location, and availability.

## Database

- Service
- Category
- ServiceSkill
- Profile — read-only.

## Business Rules

- Results must respect profile visibility. **[New]**
- Providers must not appear more than once in a provider result set. **[New]**
- Sorting must be deterministic and repeatable across identical requests. **[New]**
- Marketplace never writes to Profile data. **[New]**

<!-- [Module 3 — Marketplace] FLOW UPDATES END HERE -->

---

# 8. Create Job

## Goal

Allow clients to publish jobs.

## Flow

```
Client

↓

Create Job

↓

Validation

↓

Save Job

↓

Notify Interested Providers

↓

Job Published
```

## Database

- Job

## Business Rules

- Only Clients may create jobs.
- Jobs start in OPEN status.

---

# 9. Browse Jobs

## Goal

Allow providers to discover opportunities.

## Flow

```
Provider

↓

Browse Jobs

↓

Search

↓

Matching Jobs

↓

View Details
```

---

<!-- ============================================================ -->
<!-- [Module 5 — Proposals] FLOWS 10 AND 11 UPDATED IN 1.3.0      -->
<!-- Reconciled against docs/modules/module5.md.                   -->
<!-- Changes start here and end at the "12. Project              -->
<!-- Communication" heading.                                      -->
<!-- ============================================================ -->

# 10. Submit Proposal

## Goal

Allow providers to respond to published requirements.

## Flow

```
Provider

↓

Proposal Form

↓

Validation  (price, delivery days, cover message)

↓

Eligibility  **[New]**
  ├── job is accepting proposals  (PUBLISHED, not deleted, deadline not passed)
  ├── caller has the PROVIDER role
  ├── caller does not own the job
  └── caller has no proposal on this job already

↓

Save Proposal   → SUBMITTED

↓

Attach Media    (optional, marked PRIVATE)   **[New]**

↓

Proposal Submitted
```

**[Removed]** "Notify Client". No Notifications module exists in Phase 1 —
the client learns of a proposal by opening their requirement. Leaving the
step in the diagram would describe a message nothing sends.

## Database

- Proposal
- ProposalAttachment — **[New]**

## Business Rules

- One proposal per provider per job — **[Updated]** enforced by a unique
  constraint on `(jobId, providerProfileId)`, and absolute: a withdrawn
  proposal cannot be replaced.
- **[Updated]** The job must be _accepting proposals_: `PUBLISHED`, not
  deleted, and either without a `proposalDeadline` or with one still in the
  future. "OPEN" was never a status the schema had.

---

# 11. Accept Proposal

## Goal

Establish the hiring relationship, and close the requirement to further
proposals.

## Flow

```
Client

↓

Proposal

↓

Accept

↓

┌─ BEGIN TRANSACTION ─────────────────────────────────┐
│                                                     │
│  Claim the job:                                     │
│    UPDATE job SET FILLED WHERE status = PUBLISHED   │
│    0 rows → 409, roll back                          │
│                                                     │
│  Proposal              → ACCEPTED                   │
│  Competing proposals   → REJECTED                   │
│  Connection            → created                    │
│                                                     │
└─ COMMIT ────────────────────────────────────────────┘

↓

Connection established
```

Either all four writes land or none do. The conditional claim is what makes
two simultaneous accepts produce exactly one winner — see ADR-006 in
architecture1.3.0.md.

## Database

**[New]**

- Job — status → FILLED
- Proposal — the accepted one, and every competing SUBMITTED one
- Connection — created here and nowhere else

## Modules

- Proposals
- Jobs — through the one exported transition, `markFilled`
- ~~Contracts~~ — **[Removed]** deferred; accepting establishes the
  relationship, not a contract
- ~~Messaging~~ — **[Removed]** deferred; it will hang off the Connection
- ~~Notifications~~ — **[Removed]** deferred; the provider learns by looking

<!-- [Module 5 — Proposals] FLOWS 10 AND 11 UPDATE ENDS HERE -->

---

# 12. Project Communication

## Goal

Allow project participants to communicate.

## Flow

```
User

↓

Conversation

↓

Send Message

↓

Store Message

↓

Notify Recipient

↓

Recipient Reads Message
```

---

# 13. Payment

## Goal

Record payments between clients and providers.

## Flow

```
Client

↓

Payment Request

↓

Payment Gateway

↓

Payment Success

↓

Store Payment

↓

Update Contract

↓

Notify Users
```

## Modules

- Payments
- Contracts
- Notifications

---

# 14. Submit Review

## Goal

Build trust through ratings and feedback.

## Flow

```
Contract Completed

↓

User

↓

Submit Review

↓

Store Review

↓

Update Ratings
```

## Business Rules

- Reviews only after completed contracts.
- One review per participant.

---

# 15. Notification Flow

## Goal

Keep users informed about important events.

## Trigger Events

- New Proposal
- Proposal Accepted
- New Message
- Payment Completed
- Review Received

## Flow

```
Business Event

↓

Notification Service

↓

Create Notification

↓

Store Notification

↓

Deliver To User
```

---

# Module Interaction Overview

```
Identity
      │
      ▼
Profiles
      │
      ▼
Marketplace
      │
      ▼
Jobs
      │
      ▼
Proposals
      │
      ▼
Contracts
      │
      ▼
Messaging
      │
      ▼
Payments
      │
      ▼
Reviews
      │
      ▼
Notifications
```

---

# Entity Lifecycle

<!-- [Module 4 / Module 5] LIFECYCLES CORRECTED IN 1.3.0 -->
<!-- Both diagrams described states the schema does not have.  -->

## Job **[Updated]**

```
DRAFT
  │
  ├──→ PUBLISHED ──→ FILLED      (a proposal was accepted)
  │        │
  │        └───────→ CANCELLED
  │
  └──────────────→ CANCELLED
```

FILLED and CANCELLED are terminal. A cancelled requirement is reposted by
creating a new one, so the original's history stays intact.

There is no "Open", no "Receiving Proposals" (derivable by counting), no
"Completed" and no "Archived" — those belong to Contracts, which Phase 1 does
not build.

---

## Proposal **[Updated]**

```
SUBMITTED
   │
   ├──→ ACCEPTED   ──→ Connection created, job FILLED
   │
   ├──→ REJECTED   (by the client, or automatically when a rival is accepted)
   │
   └──→ WITHDRAWN  (by the provider; final for that requirement)
```

There is no Draft state — a proposal is submitted complete, in one operation
— and no "Viewed" state, which would be read-tracking nothing acts on.
All three end states are terminal.

---

## Connection **[New]**

```
created (on acceptance)
   │
   └──→ consumed by Contracts / Messaging / Payments  (future modules)
```

Phase 1 has no status column and no closing transition: the row existing is
what "active" means. Closing arrives with the module that needs a second
state.

---

## Contract

```
Created

↓

Active

↓

Milestones

↓

Completed

or

Cancelled
```

---

## Payment

```
Pending

↓

Processing

↓

Successful

↓

Completed

or

Failed

or

Refunded (Future)
```

---

## Review

```
Eligible

↓

Submitted

↓

Published
```

---

# Future Flows (Out of Scope)

The following workflows are intentionally excluded from Phase 1:

- Organization Management
- Team Invitations
- Action-Based Permissions
- Escrow
- Wallet Management
- Payouts
- Multi-Tenant Routing
- White-Label Branding
- AI Recommendations
- AI Marketplace Assistant
- Advanced Analytics

**[Updated]** "Audit Logging" removed from this list — built in Phase 1 as part of the Identity module (see apps/api/src/audit), not deferred.

---
