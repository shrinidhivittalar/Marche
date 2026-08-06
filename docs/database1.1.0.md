# Database Design

> Version: 1.1.0
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

## 3. Marketplace Module

### Goals

- Allow providers to publish services.
- Organize services into categories.
- Allow users to browse and discover services.

### Tables

- Category
- SubCategory
- Service
- ServiceImage
- ServicePackage

---

## 4. Job Module

### Goals

- Allow clients to publish job postings.
- Allow providers to submit proposals.
- Track the hiring lifecycle.

### Tables

- Job
- JobAttachment
- Proposal
- ProposalAttachment

---

## 5. Contract Module

### Goals

- Convert accepted proposals into active contracts.
- Track project progress.
- Manage project milestones.

### Tables

- Contract
- Milestone
- Deliverable

---

## 6. Messaging Module

### Goals

- Enable communication between users.
- Maintain project conversations.
- Support file sharing.

### Tables

- Conversation
- Message
- MessageAttachment

---

## 7. Payment Module

### Goals

- Record marketplace transactions.
- Track payment status.
- Prepare the system for payment gateway integration.

### Tables

- Payment

---

## 8. Review Module

### Goals

- Build trust between users.
- Allow clients and providers to review each other.

### Tables

- Review

---

## 9. Notification Module

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
