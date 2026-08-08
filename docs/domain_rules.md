# Domain Rules

> **[Updated]** Section 4 "Services" reconciled with docs/modules/module3.md
> — added category hierarchy, service skills, visibility/discovery rules,
> and made the soft-delete requirement explicit. This document is
> unversioned by design, so changes are marked inline rather than by a
> version bump. No other section changed.

> **[Updated]** Section 3 "Profiles" reconciled with docs/modules/module2.md
> — single shared Profile per user instead of separate Provider/Client
> Profile records; clarified that portfolio/skills/education stay
> Provider-only even though the table is shared; added the lightweight
> Verified badge rule. No other section changed.

## Purpose

This document defines the core business and domain rules of Marché.

Unlike the database schema, which describes how data is stored, this document describes how the system is expected to behave.

These rules will be used while designing the database, APIs, backend services, and frontend workflows.

---

# 1. Users

## Rules

- Every user must register using a unique email address.
- Passwords must never be stored in plain text.
- Passwords must always be hashed before storage.
- A user must verify their email before accessing protected features.
- A user account may be Active, Suspended, Disabled or Deleted.
- Deleted users should be soft deleted whenever possible.
- Users should be able to update their profile information.
- Users may upload profile images.
- Every user has one account throughout the platform.

---

# 2. Roles

## Rules

- Every user must have exactly one primary role during Phase 1.
- Supported roles are:
  - Client
  - Provider
  - Admin
- A Provider can also become a Client in future versions.
- Platform Administrators can access administrative functionality.

---

# 3. Profiles

## Rules

- Every user has exactly one Profile, regardless of role. **[Updated]** — a single shared table, not separate Provider/Client Profile records (was: "Every Provider has one Provider Profile. Every Client has one Client Profile.").
- Providers may upload multiple portfolio items. Clients may not — portfolio, skills, experience, education, certifications and availability remain Provider-only even though Profile is a shared table. **[Updated]**
- Providers may list multiple skills.
- Providers may list education, certifications and experience.
- Providers may list languages spoken, with proficiency level. **[New]**
- Providers may set their availability status. **[New]**
- A Profile may carry a system-computed "Verified" badge (e.g. email verified + a minimum number of completed jobs) — this is not identity/KYC verification, which remains excluded from Phase 1 (see phase_scope1.1.0.md). **[New]**
- Ratings are calculated from completed reviews.

---

<!-- ============================================================ -->
<!-- [Module 3 — Marketplace] SECTION UPDATED                     -->
<!-- Reconciled against docs/modules/module3.md.                  -->
<!-- Changes start here and end at the "5. Jobs" heading.         -->
<!-- ============================================================ -->

# 4. Services

## Rules

- Only Providers can create Services.
- Every Service belongs to exactly one Category.
- Every Service belongs to exactly one Profile. **[New]**
- ~~Services may contain multiple images.~~ — **[Updated]** deferred out of Phase 1. Service images are not implemented; cards use the Profile avatar and portfolio previews instead. See phase_scope1.2.0.md.
- A Service may reference multiple predefined Skills. **[New]**
- Services can be published or unpublished.
- Services can be edited by their owner, and only by their owner. **[Updated]**
- Deleted services should not remove historical contracts.
- Service deletion is therefore always a soft delete. **[New]** Made explicit — the rule above states the requirement, not the mechanism.
- Contracts must capture agreed service terms at signing time rather than reading a live Service row, since services remain editable. **[New]**

## Categories **[New]**

- Categories are platform-defined, not user-created.
- Categories may nest one level deep: a parent and its children.
- A child category may not itself have children.
- A category that still has services or children cannot be deleted.
- Only Administrators may create, update, or delete categories.

## Discovery **[New]**

- Only published services are publicly discoverable.
- A service is discoverable only if its owning profile is public and its owning user is active.
- Filtering by a parent category includes services in all of its children.
- A provider must never appear more than once in a provider result set.
- Marketplace discovery reads profile data but never writes it.
- Ranking is deterministic; sort options the platform cannot honestly compute are rejected rather than approximated.

<!-- [Module 3 — Marketplace] SECTION UPDATE ENDS HERE -->

---

# 5. Jobs

## Rules

- Only Clients can create Jobs.
- Jobs belong to the Client who created them.
- Jobs must belong to one Category.
- Jobs can be Draft, Open, In Progress, Completed or Cancelled.
- Closed Jobs should not receive new proposals.

---

# 6. Proposals

## Rules

- Only Providers may submit Proposals.
- A Provider may submit only one Proposal per Job.
- A Proposal belongs to one Job.
- A Proposal belongs to one Provider.
- A Proposal can be Accepted, Rejected or Withdrawn.
- Accepting a Proposal creates a Contract.

---

# 7. Contracts

## Rules

- Contracts are created only after a Proposal is accepted.
- Every Contract has one Client.
- Every Contract has one Provider.
- Contracts may contain multiple Milestones.
- Completed Contracts become eligible for Reviews.
- Cancelled Contracts cannot be resumed.

---

# 8. Milestones

## Rules

- Milestones belong to a Contract.
- Milestones are completed sequentially.
- Completed Milestones cannot be edited.
- Future versions may associate payments with milestones.

---

# 9. Messaging

## Rules

- Users can communicate only through Conversations.
- Messages always belong to one Conversation.
- Messages cannot exist independently.
- Attachments belong to Messages.
- Deleted Messages should remain recoverable for moderation purposes.

---

# 10. Payments

## Rules

- Every Payment belongs to one Contract.
- Payments must maintain transaction history.
- Failed payments should never modify Contract status.
- Future versions will integrate payment gateways.

---

# 11. Reviews

## Rules

- Reviews can only be submitted after Contract completion.
- Both Client and Provider may submit one Review each.
- Users cannot review themselves.
- Reviews become part of the Provider's reputation.

---

# 12. Notifications

## Rules

- Notifications belong to Users.
- Notifications should never be deleted automatically.
- Users may mark Notifications as read.
- Notifications may be generated by any module.

---

# 13. Administration

## Rules

- Administrators may suspend users.
- Administrators may remove inappropriate content.
- Administrative actions should be logged.
- Moderation tools are introduced in future phases.

---

# General System Rules

- UUIDs should be used as primary keys.
- Every table should include created_at and updated_at timestamps.
- Soft deletion should be preferred over permanent deletion where appropriate.
- Referential integrity must be maintained using foreign keys.
- Historical data should be preserved whenever possible.
- Database constraints should enforce critical business rules instead of relying solely on application logic.

---

# Phase 1 Scope

The following capabilities are included in Phase 1:

- User Registration
- Login
- Profile Management
- Service Listings
- Job Posting
- Proposal Submission
- Contract Creation
- Messaging
- Payments
- Reviews
- Notifications

---

# Future Scope

The following capabilities are intentionally deferred:

- Organizations
- Multi-tenancy
- White-labeling
- Action-based permissions
- Escrow
- Wallets
- Payouts
- AI recommendations
- AI assistants
- Advanced analytics
- Enterprise features
