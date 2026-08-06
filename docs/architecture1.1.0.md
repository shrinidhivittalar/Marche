# Marché Architecture

> Version: 1.1.0
>
> Status: Draft
>
> Last Updated: 3-8-2026
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

## Marketplace

Responsible for:

- Categories
- Services
- Service Discovery

---

## Jobs

Responsible for:

- Job Posting
- Proposal Submission
- Hiring Workflow

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
Contract
    │
Payment
    │
Review
```

Each module communicates only through well-defined APIs.

Modules should never directly manipulate another module's internal business logic.

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

Only metadata and storage URLs are stored in the database.

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
