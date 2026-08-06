# Data Flow

> Version: 1.1.0
>
> Status: Draft
>
> Last Updated: 3-8-2026
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

# 6. Publish Service

## Goal

Allow providers to publish services.

## Flow

```
Provider

↓

Create Service

↓

Upload Images

↓

Validation

↓

Save Service

↓

Marketplace Updated
```

## Modules

- Marketplace

## Database

- Service
- ServiceImage
- Category

## Business Rules

- Only Providers may publish services.
- Service must belong to a category.

---

# 7. Browse & Search Services

## Goal

Allow clients to discover providers.

## Flow

```
Client

↓

Search / Filters

↓

Marketplace API

↓

Database Search

↓

Matching Services

↓

Results Displayed
```

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

# 10. Submit Proposal

## Goal

Allow providers to apply for jobs.

## Flow

```
Provider

↓

Proposal Form

↓

Validation

↓

Save Proposal

↓

Notify Client

↓

Proposal Submitted
```

## Database

- Proposal

## Business Rules

- One proposal per provider per job.
- Job must still be OPEN.

---

# 11. Accept Proposal

## Goal

Convert a proposal into an active project.

## Flow

```
Client

↓

Proposal

↓

Accept

↓

Proposal Status Updated

↓

Contract Created

↓

Conversation Created

↓

Notifications Sent
```

## Modules

- Proposal
- Contracts
- Messaging
- Notifications

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

## Job

```
Draft

↓

Open

↓

Receiving Proposals

↓

Proposal Accepted

↓

Contract Created

↓

Completed

↓

Archived
```

---

## Proposal

```
Draft

↓

Submitted

↓

Viewed

↓

Accepted
      │
      ├──► Contract Created
      │
      ▼
Rejected

or

Withdrawn
```

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
