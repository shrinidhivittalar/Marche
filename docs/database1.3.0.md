# Database Design

> Version: 1.3.0
>
> **[Updated]** Changelog from 1.2.0 (minor): the "Job Module" section split
> into a Jobs half and a Proposals half, reconciled with
> docs/modules/module5.md. Proposal and ProposalAttachment kept; Connection
> added as a table this document never listed. Also records what Module 04
> actually built, since Module 04 shipped without a documentation version
> bump — 1.2.0 was the current version throughout its implementation. No
> other module's section changed.
>
> Changelog from 1.1.0 (minor): Marketplace Module section reconciled with
> docs/modules/module3.md, written after this document. SubCategory folded
> into Category as a self-referencing parent; ServiceSkill added;
> ServiceImage and ServicePackage deferred out of Phase 1. No other
> module's section changed.
>
> Changelog from 1.0.0 (minor): Profile Module section reconciled with the
> detailed module spec (docs/modules/module2.md), written after this
> document. ProviderProfile/ClientProfile consolidated into a single
> Profile table shared by both roles; UserSkill, UserLanguage, and
> ProfileStatistics added. No other module's section changed.

## Purpose

This document serves as the high-level blueprint for the database architecture of Marché.

Instead of defining implementation details, it identifies the core business modules, their responsibilities, and the entities that must be persisted to support the marketplace.

The objective is to model the business domain first, then translate it into an ER diagram, Prisma schema, and backend implementation.

---

# Guiding Principles

- Design around business entities, not UI screens.
- Keep Phase 1 focused on the core marketplace experience.
- Avoid over-engineering by introducing features only when required.
- Keep the architecture modular so future features can be added without major redesign.
- Use PostgreSQL as the primary relational database.
- Every module should have a clearly defined responsibility.

---

# Phase 1 - Core Marketplace

The following modules are required to build the first production-ready version of Marché.

---

## 1. Identity Module

### Goals

- Register new users.
- Authenticate users securely.
- Manage user sessions.
- Support different user roles.
- Serve as the foundation for the entire platform.

### Tables

- User
- Session
- UserRole
- VerificationToken
- PasswordReset
- OAuthAccount (Optional)

---

## 2. Profile Module

### Goals

- Maintain a professional profile for every user (client or provider).
- Build user credibility.
- Showcase portfolios, skills and experience.

### Tables

- Profile — one per User, shared shape for both Client and Provider roles rather than two separate tables (see docs/modules/module2.md for the reasoning).
- Portfolio
- PortfolioImage
- Skill
- UserSkill — join table between Profile and Skill.
- UserLanguage
- Experience
- Education
- Certification
- ProfileStatistics — system-generated, one per Profile.

---

<!-- ============================================================ -->
<!-- [Module 3 — Marketplace] SECTION UPDATED IN 1.2.0           -->
<!-- Reconciled against docs/modules/module3.md.                  -->
<!-- Changes start here and end at the "4. Job Module" heading.   -->
<!-- ============================================================ -->

## 3. Marketplace Module

### Goals

- Allow providers to publish services.
- Organize services into categories.
- Allow users to browse and discover services.
- Allow users to discover providers by skill, category, and location. **[New]**

### Tables

- Category — **[Updated]** now carries a nullable self-referencing `parentId` instead of a separate SubCategory table.
- Service
- ServiceSkill — **[New]** join table between Service and the existing Skill table (owned by the Profile module, referenced not duplicated).

### Deferred out of Phase 1 **[New]**

- SubCategory — **[Removed]** merged into Category. A two-level hierarchy is expressed by `Category.parentId`, so a second table adds a join and a second set of CRUD paths for no additional capability.
- ServiceImage — **[Removed]** deferred. Image handling platform-wide is still pasted-URL-only (no upload pipeline, no file validation); a third URL-string image table would mean migrating three tables instead of two when object storage lands. Service and provider cards use Profile avatars and portfolio previews in the meantime. See module3.md "Known Gaps".
- ServicePackage — **[Removed]** deferred. Phase 1 uses a single starting price per Service. Tiered pricing is the one deferral with real migration cost, which is precisely why it is not built speculatively.

<!-- [Module 3 — Marketplace] SECTION UPDATE ENDS HERE -->

---

<!-- ============================================================ -->
<!-- [Module 4 — Jobs / Module 5 — Proposals]                     -->
<!-- SECTION UPDATED IN 1.3.0                                     -->
<!-- The single "Job Module" heading became two, reconciled       -->
<!-- against docs/modules/module5.md and against what Module 04   -->
<!-- actually shipped. Changes start here and end at the          -->
<!-- "6. Contract Module" heading.                                -->
<!-- ============================================================ -->

## 4. Job Module

### Goals

- Allow clients to publish job postings.
- ~~Allow providers to submit proposals.~~ — **[Updated]** moved to its own
  module below. Proposals are a separate lifecycle with a separate owner and
  their own authorization rules; folding them under Jobs is what would make
  Jobs depend on Proposals.
- Track the requirement lifecycle: draft, published, filled, cancelled.

### Tables

- Job
- JobAttachment

---

## 5. Proposal Module **[New]**

### Goals

- Allow providers to respond to published requirements.
- Allow clients to review and decide between responses.
- Establish the hiring relationship when a response is accepted.

### Tables

- Proposal
- ProposalAttachment
- Connection — **[New]** the relationship created when a proposal is
  accepted. This document never listed it; `status.md` recorded its shape as
  an open question, and module5.md settles it as its own row rather than "a
  proposal in the accepted state". Everything downstream — messaging,
  contracts, payments — belongs to _two parties for one job_, which is not
  what a Proposal row is: that stays a historical record of what was offered.

### Notes carried from module5.md **[New]**

- `Proposal` is keyed to the provider by **profile** id, not user id, matching
  `Job.clientProfileId`. Storing both would be the same fact twice.
- `(jobId, providerProfileId)` is uniquely constrained, absolutely — one
  proposal per provider per job, ever. Withdrawal is therefore permanent for
  that requirement.
- `Connection` is uniquely constrained on both `jobId` and `proposalId`, which
  is what makes "exactly one winner" true even under concurrent acceptance.
- No `ConnectionStatus` and no `Proposal.deletedAt` — a one-member enum and a
  soft-delete column nothing writes.

<!-- [Module 4 / Module 5] SECTION UPDATE ENDS HERE -->

---

## 6. Contract Module

### Goals

- Convert accepted proposals into active contracts.
- Track project progress.
- Manage project milestones.

### Tables

- Contract
- Milestone
- Deliverable

---

## 7. Messaging Module

### Goals

- Enable communication between users.
- Maintain project conversations.
- Support file sharing.

### Tables

- Conversation
- Message
- MessageAttachment

---

## 8. Payment Module

### Goals

- Record marketplace transactions.
- Track payment status.
- Prepare the system for payment gateway integration.

### Tables

- Payment

---

## 9. Review Module

### Goals

- Build trust between users.
- Allow clients and providers to review each other.

### Tables

- Review

---

## 10. Notification Module

### Goals

- Notify users about important platform events.
- Maintain notification history.

### Tables

- Notification

---

# Phase 2 - Business Expansion

These modules are intentionally excluded from the MVP but have been identified for future iterations.

---

## Organization Module

### Goals

- Support companies with multiple members.
- Enable team-based hiring.
- Prepare for enterprise customers.

### Possible Tables

- Organization
- OrganizationMember

---

## Authorization Module

### Goals

- Support action-based permissions.
- Enable custom organizational roles.

### Possible Tables

- Role
- Permission
- RolePermission

---

## Finance Module

### Goals

- Support escrow.
- Support payouts.
- Support invoices.
- Support refunds.

### Possible Tables

- Wallet
- Escrow
- Invoice
- Refund
- Payout

---

## Administration Module

### Goals

- Support platform moderation.
- Handle abuse reports.
- Manage support requests.

### Possible Tables

- Report
- SupportTicket
- AuditLog

---

## Search Module

### Goals

- Save searches.
- Improve discovery.
- Support advanced filtering.

### Possible Tables

- SavedSearch

---

## AI Module

### Goals

- AI-powered service recommendations.
- AI-assisted matching.
- AI marketplace assistant.

### Possible Tables

- AIRecommendation
- AIConversation

---

## Analytics Module

### Goals

- Generate business insights.
- Measure marketplace growth.
- Support dashboards.

### Tables

No dedicated tables planned initially.
Analytics will be generated from transactional data.

---

# Next Steps

The implementation workflow will follow the order below:

1. Finalize this database overview.
2. Design each module independently.
3. Define business rules for each module.
4. Design table structures.
5. Create ER diagrams.
6. Implement Prisma schema.
7. Generate database migrations.
8. Build backend APIs.
9. Integrate with the frontend.
