# Phase Scope

> Version: Phase 1 (MVP)
>
> Status: Draft
>
> Last Updated: YYYY-MM-DD

---

# Purpose

This document defines the implementation roadmap of Marché.

The objective is to clearly separate:

- Features that are required for the MVP.
- Features that are intentionally postponed.
- Features that may be introduced as the platform grows.

This prevents unnecessary complexity and ensures development remains focused on delivering a functional marketplace before introducing advanced capabilities.

---

# Guiding Principles

- Build only what is required for the marketplace to function.
- Avoid premature optimization.
- Design for scalability without implementing unnecessary features.
- Every phase should deliver a usable product.
- Future phases should extend the existing architecture instead of replacing it.

---

# Phase 1 — Core Marketplace (MVP)

## Goal

Build a complete marketplace where clients can hire service providers from discovery to payment.

The platform should be fully functional for day-to-day usage by individual clients and providers.

---

## Identity

### Included

- User Registration
- Login
- Logout
- Password Reset
- Email Verification
- Session Management
- JWT Authentication

### Excluded

- Social Login
- MFA
- Account Linking

---

## Profiles

### Included

- Provider Profile
- Client Profile
- Skills
- Experience
- Portfolio
- Profile Image

### Excluded

- Public Resume Builder
- Identity Verification
- KYC

---

## Marketplace

### Included

- Categories
- Service Listings
- Service Images
- Search
- Filters

### Excluded

- AI Recommendations
- Personalized Search
- Sponsored Listings

---

## Jobs

### Included

- Create Job
- Browse Jobs
- Edit Job
- Close Job

### Excluded

- Invite Providers
- Private Jobs
- Recurring Jobs

---

## Proposals

### Included

- Submit Proposal
- Accept Proposal
- Reject Proposal
- Withdraw Proposal

### Excluded

- Proposal Templates
- AI Proposal Generation

---

## Contracts

### Included

- Create Contract
- Contract Status
- Basic Milestones

### Excluded

- Contract Amendments
- Version History
- Digital Signatures

---

## Messaging

### Included

- Conversations
- Messages
- Attachments

### Excluded

- Voice Calls
- Video Calls
- Screen Sharing

---

## Payments

### Included

- Payment Integration
- Payment Records
- Payment Status

### Excluded

- Escrow
- Wallet
- Refund Management
- Payout Automation
- Multi-Currency

---

## Reviews

### Included

- Ratings
- Written Reviews

### Excluded

- Review Responses
- Review Moderation
- Reputation Analytics

---

## Notifications

### Included

- In-App Notifications

### Excluded

- Push Notifications
- SMS Notifications
- Email Preferences

---

## Administration

### Included

- Basic Admin Dashboard
- User Management
- Service Moderation

### Excluded

- Audit Logs
- Moderation Queue
- Admin Analytics

---

# Phase 2 — Marketplace Expansion

## Goal

Enhance usability and improve the experience for growing marketplaces.

### Features

- Organizations
- Team Members
- Saved Services
- Saved Jobs
- Wishlist
- Recently Viewed
- Better Search
- Advanced Filters
- Email Notifications
- Push Notifications
- Review Responses
- Refunds
- Payout Tracking
- Payment History
- AI Search
- AI Recommendations

---

# Phase 3 — Professional Marketplace

## Goal

Support freelancers and businesses working on larger, long-running projects.

### Features

- Action-Based Permissions (RBAC)
- Organization Workspaces
- Team Hiring
- Project Dashboard
- Time Tracking
- Activity Timeline
- File Versioning
- Advanced Contracts
- Contract Amendments
- Recurring Contracts
- Advanced Reporting

---

# Phase 4 — Enterprise

## Goal

Prepare the platform for enterprise-scale customers.

### Features

- SSO
- Multi-Factor Authentication
- Audit Logs
- Approval Workflows
- Compliance
- Organization Policies
- Enterprise Reporting
- Bulk User Management

---

# Phase 5 — Platform Evolution

## Goal

Transform Marché into a highly scalable marketplace platform.

### Features

- AI Marketplace Assistant
- AI Proposal Generation
- AI Matching
- AI Search
- AI Moderation
- AI Analytics
- AI Fraud Detection

- Redis
- Background Jobs
- Socket.IO
- OpenSearch
- Elasticsearch
- Event-Driven Architecture

---

# Future Considerations

The following features are intentionally excluded until justified by business requirements.

## White-Label Support

Allows organizations to create branded marketplaces.

Status

Deferred

---

## Multi-Tenant Architecture

Supports multiple independent marketplaces.

Status

Deferred

---

## Microservices

Current architecture uses a modular monolith.

Microservices will only be considered if operational complexity justifies the migration.

Status

Deferred

---

## Kubernetes

Deployment orchestration for large-scale infrastructure.

Status

Deferred

---

# Definition of MVP

The MVP is considered complete when the following workflow can be completed without manual intervention:

1. Register an account.
2. Verify email.
3. Complete profile.
4. Publish a service.
5. Search for services.
6. Create a job.
7. Submit a proposal.
8. Accept a proposal.
9. Create a contract.
10. Exchange messages.
11. Complete payment.
12. Leave a review.

If all of the above workflows function correctly, Phase 1 is considered complete.

---

# Success Criteria

Phase 1 is successful if:

- Every core marketplace workflow is operational.
- Authentication is secure.
- Data integrity is maintained.
- The backend follows the documented architecture.
- Documentation is complete.
- APIs are fully documented.
- Frontend is fully integrated.
- The system can support real users.

---