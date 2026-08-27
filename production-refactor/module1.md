# Module 01 — Identity, Authentication, Access & Trust

## 1. Purpose

Module 01 owns the lifecycle of a Marché identity.

It is responsible for:

- Account creation
- Authentication
- Session management
- Email verification
- Password management
- Social authentication
- Secure authentication-method linking
- Platform roles and strict RBAC
- Marketplace capabilities
- Verification and trust foundations
- Identity-related rate limiting
- Identity-related idempotency
- Account status and administrative access control

This module establishes the security boundary for the rest of Marché.

---

# 2. Core Product Principles

## 2.1 One person, one Marché identity

A person must have one primary Marché identity.

That identity may participate in the marketplace in multiple ways.

```text
User
├── Can hire services
└── Can provide services
```

A user must not need:

```text
❌ One Client account
❌ One Provider account
```

Client and Provider participation must coexist under the same `User`.

---

## 2.2 Identity, capability, and authority are different

These concepts must not be mixed.

```text
Identity
    ↓
Who is this person?

Authentication
    ↓
How do they prove they are this person?

Capability
    ↓
What marketplace activities can they perform?

Role / Permission
    ↓
What platform authority do they have?
```

---

# 3. Identity Model

The existing fixed model:

```text
CLIENT | PROVIDER | ADMIN
```

must be replaced.

The system must support:

```text
One User
    ├── CLIENT capability
    ├── PROVIDER capability
    └── Platform roles
```

A user may have both:

```text
CLIENT + PROVIDER
```

simultaneously.

---

# 4. Marketplace Capabilities

Capabilities determine how a user participates in the marketplace.

Initial capabilities:

```text
CLIENT
PROVIDER
```

## CLIENT

Allows the user to participate as a buyer/client.

Examples:

- Post jobs
- Hire providers
- Manage engagements
- Make payments
- Leave reviews

## PROVIDER

Allows the user to participate as a service provider.

Examples:

- Create services
- Publish services
- Submit proposals
- Accept engagements
- Receive marketplace payments
- Leave reviews

A capability must be independently activatable.

---

# 5. Provider Activation

A user does not automatically become a Provider merely because they created an account.

Provider participation must be activated through onboarding.

Initial activation requirements:

```text
1. Valid Marché account
2. Verified email
3. Required provider profile information
4. At least one valid service/category setup
5. Any category-specific requirements
```

The exact provider onboarding requirements belong to the Profiles and Marketplace modules, but Module 01 owns the capability state.

Example:

```text
User
  ↓
CLIENT capability active
  ↓
Clicks "Become a Provider"
  ↓
Completes required onboarding
  ↓
PROVIDER capability activated
```

The same `User.id` must remain unchanged.

---

# 6. Platform Roles and Strict RBAC

Platform authority must be implemented separately from marketplace capabilities.

Initial platform roles:

```text
USER
ADMIN
SUPER_ADMIN
```

## USER

Normal platform user.

This role alone does not grant administrative privileges.

## ADMIN

Operational administrative authority.

Examples may include:

- Moderation
- Dispute handling
- User management
- Content/category administration

Actual permissions must be explicitly assigned.

## SUPER_ADMIN

Highest platform authority.

Super Admin is intended for platform-level administration and configuration.

Examples:

- Administrative role management
- Platform configuration
- High-risk user actions
- System-level configuration
- Permission management

---

# 7. RBAC Requirements

RBAC must be enforced strictly on the backend.

The frontend may hide UI, but:

> Frontend visibility is never authorization.

Authorization must use three layers.

```text
1. Authentication
        ↓
2. RBAC / capability authorization
        ↓
3. Resource ownership or domain access
```

Example:

```text
Can this user perform "UPDATE_JOB"?
        ↓
Capability/permission check
        ↓
Does this specific Job belong to them?
```

Both checks are required.

---

## 7.1 Declarative authorization

New production code should move away from relying primarily on scattered inline authorization checks.

NestJS should use a consistent authorization mechanism.

The exact implementation may use:

```text
@RequireRoles(...)
@RequirePermissions(...)
@RequireCapabilities(...)
```

with guards and metadata.

The exact decorator names are implementation details.

The requirement is:

> Authorization rules must be centrally understandable, consistently enforced, and testable.

Domain-specific ownership checks may remain inside services or dedicated access-policy utilities.

---

## 7.2 Permission model

Roles should not automatically mean unrestricted access.

The system should support:

```text
Role
    ↓
Permissions
```

For example:

```text
USER
    └── normal platform permissions

ADMIN
    ├── MANAGE_DISPUTES
    ├── MODERATE_CONTENT
    └── MANAGE_USERS

SUPER_ADMIN
    └── PLATFORM_CONFIGURATION
```

Exact permissions should be defined before implementing the corresponding admin modules.

Do not hardcode Super Admin checks throughout unrelated services.

---

# 8. Admin Provisioning

Normal signup must never expose:

```text
Are you an Admin?
Are you a Super Admin?
```

There must be:

- No public Admin signup
- No public Super Admin signup
- No client-controlled role elevation
- No frontend-only protection

Administrative access must only be granted through an authorized internal process.

Role elevation must:

1. Require authorization
2. Be audited
3. Record the actor
4. Record the target
5. Record the previous state
6. Record the new state
7. Record the timestamp

---

# 9. Authentication Methods

A User may have multiple authentication methods.

Initial methods:

```text
EMAIL_PASSWORD
GOOGLE
```

Future methods may be added without changing the User identity model.

Example:

```text
User #123

Authentication Methods
├── Email + Password
└── Google
```

The user must remain the same Marché identity regardless of which linked method they use.

---

# 10. Email and Password Authentication

Preserve the existing strong authentication design where possible.

Current principles to preserve:

- Password hashing using Argon2
- Short-lived access tokens
- Rotating refresh tokens
- Refresh tokens stored hashed
- Single-use refresh rotation
- Refresh reuse detection
- Revocation of affected sessions after detected reuse

The existing implementation should be refactored only where necessary to support the new identity model.

Do not weaken existing session security.

---

# 11. Google Authentication

Google is the initial social authentication provider.

The flow must support:

```text
Continue with Google
        ↓
Validate provider response
        ↓
Resolve Marché identity
        ↓
Create or authenticate User
        ↓
Create Marché session
```

Google authentication must integrate into the same internal session model as password login.

---

# 12. Secure Account Linking

The system must avoid accidental duplicate accounts.

Example:

```text
Existing Marché User
Email: user@example.com

User continues with Google
Google identity resolves to:
user@example.com
```

The system must determine whether the authentication method belongs to an existing Marché identity.

Account linking must not blindly occur merely because a client sends an email address.

The linking mechanism must use trusted identity proof from the authentication provider and appropriate verification rules.

The resulting state must be:

```text
One User
├── Email/password
└── Google
```

not:

```text
❌ User #123 → password
❌ User #987 → Google
```

when both represent the same verified identity.

---

# 13. Email Verification

Email verification is required for a trusted active marketplace identity.

The system must support:

```text
UNVERIFIED
VERIFIED
```

Verification tokens must:

- Be cryptographically secure
- Expire
- Be single-use or safely invalidated after use
- Not expose sensitive information
- Be rate limited

The client must never be trusted to claim verification status.

---

# 14. Verification & Trust Architecture

Do not use one global boolean:

```text
isVerified
```

The architecture must support independent verification records.

Verification types:

```text
EMAIL
PHONE
IDENTITY
PROVIDER
CREDENTIAL
BUSINESS
```

Not all types need to be implemented now.

Initial implementation:

```text
EMAIL → implemented
PHONE → architecture-ready / future implementation
IDENTITY → future
PROVIDER → capability/onboarding-driven
CREDENTIAL → future, category-dependent
BUSINESS → future
```

A verification record should support a lifecycle such as:

```text
PENDING
VERIFIED
REJECTED
EXPIRED
```

The exact schema may distinguish verification types where their data requirements materially differ.

Do not over-generalize prematurely.

---

# 15. Account Status

User account status must be centrally enforced.

Supported lifecycle should include:

```text
ACTIVE
SUSPENDED
DISABLED
DELETED
```

The existing status enum must have actual transition mechanisms.

Required rules:

### ACTIVE

Normal access.

### SUSPENDED

Access restricted according to suspension policy.

The exact behavior must be explicit. For example, suspended users must not continue performing marketplace transactions merely because they possess a valid JWT.

### DISABLED

Account cannot authenticate normally.

### DELETED

Soft-deleted identity.

Sensitive historical records must remain available where legally/domain required.

---

# 16. Session Enforcement

User status must be checked during authenticated access.

It is insufficient to validate only:

```text
JWT signature
JWT expiration
```

The current user/account state must be respected for sensitive authenticated actions.

A suspended or disabled account must not retain unrestricted access simply because an access token was issued before the status change.

The implementation must balance immediate revocation requirements with performance.

---

# 17. Marketplace Integrity: No Self-Dealing

This is a system-wide invariant.

> A marketplace transaction must involve two distinct User identities.

The same User must never participate as both sides of the same engagement.

Formally:

```text
Client User ID != Provider User ID
```

The following must be blocked server-side:

- Submitting a proposal to one's own Job
- Accepting one's own proposal
- Direct hiring oneself
- Creating a Connection involving the same User on both sides
- Creating a payment that results in self-dealing
- Creating self-generated reviews

This rule must not depend on:

- UI restrictions
- Current selected mode
- Client-provided role values

The backend must resolve ownership to the underlying `User.id`.

---

# 18. Client / Provider Mode Switching

The product may expose modes such as:

```text
[ Hiring ] ↔ [ Providing ]
```

This is a UI/context preference.

It must not create a new identity.

```text
Mode switch
    ≠
Role replacement
    ≠
New account
```

A mode switch changes the user's active experience, not their underlying identity.

Authorization must always use actual backend capabilities and permissions rather than trusting the currently selected frontend mode.

---

# 19. Rate Limiting

Rate limiting must be contextual.

A single IP-only limit is insufficient.

Identity-related flows should support multiple dimensions.

## Login

```text
IP
+
Email/identifier
```

## Registration

```text
IP
+
Email
```

## Password reset

```text
IP
+
Email
+
Cooldown
```

## Authenticated sensitive actions

```text
User ID
+
IP backstop
```

The exact thresholds are configuration, not hardcoded business logic.

Production Redis remains required for distributed rate limiting.

The existing production requirement must be preserved:

```text
NODE_ENV=production
+
No REDIS_URL
        ↓
Application fails to boot
```

Local development may retain the in-memory fallback.

---

# 20. Rate Limiting Is Not Fraud Prevention

The system must not assume:

```text
Rate limit = fraud prevention
```

Multiple accounts, IPs, devices, or networks can bypass simplistic limits.

The architecture should preserve signals useful for future abuse detection:

- User identity
- Authentication history
- Verification state
- Relevant audit events
- Suspicious transaction patterns

Do not build invasive automatic device fingerprinting or aggressive same-IP blocking in V1.

Suspicion is not proof of abuse.

---

# 21. Idempotency

Identity operations with meaningful side effects must be safe against retries.

Use structural/database guarantees where appropriate.

Use explicit idempotency mechanisms where structural guarantees are insufficient.

Candidate operations include:

```text
Registration
Authentication-method linking
Provider capability activation
Verification submission
Sensitive account transitions
```

The implementation must define:

- Idempotency scope
- Key ownership
- Request replay behavior
- Response behavior
- Expiration/retention policy

Do not add a generic idempotency key requirement to every endpoint.

Existing payment and marketplace idempotency mechanisms are outside this module and must remain compatible.

---

# 22. Audit Logging

The following actions must be auditable:

- Administrative role changes
- Permission changes
- User suspension
- User disabling
- User restoration where supported
- Sensitive verification decisions
- Administrative account changes
- Authentication-method linking/unlinking where security-relevant

Audit logs must not depend on a surviving User foreign key where the existing architecture intentionally preserves history after deletion.

The existing `AuditLog` design should be preserved unless the identity refactor exposes a concrete limitation.

---

# 23. API Security Requirements

Sensitive endpoints must:

- Require authentication where appropriate
- Apply strict RBAC/capability checks
- Validate DTOs
- Avoid trusting client-supplied user IDs
- Resolve identity from the authenticated context
- Return safe errors
- Avoid leaking account existence unnecessarily in sensitive flows
- Be rate limited where abuse is realistic

Examples:

```text
❌ POST /users/:id/promote-admin
```

must never trust arbitrary client-provided identity context without strict authorization.

---

# 24. Data Model Direction

The exact Prisma schema must be designed before migration, but the conceptual model is:

```text
User
│
├── AuthenticationMethod
│     ├── EMAIL_PASSWORD
│     └── GOOGLE
│
├── Session
│
├── PlatformRole
│
├── Permission / RolePermission
│
├── UserCapability
│     ├── CLIENT
│     └── PROVIDER
│
└── Verification
      ├── EMAIL
      ├── PHONE
      └── future types
```

Do not duplicate User identities to represent marketplace capabilities.

---

# 25. Database Invariants

The database must protect important uniqueness constraints.

Examples:

```text
One User ↔ one capability record per capability

One external authentication identity
    ↔ one Marché User

One permission assignment
    ↔ no duplicate role-permission pair
```

The exact unique constraints must be specified in the Prisma migration plan.

Where a critical invariant cannot be represented directly as a simple database constraint, it must be enforced transactionally in the service layer and tested for concurrency.

---

# 26. Migration From Current Architecture

The current production architecture contains:

```text
User.role

CLIENT
PROVIDER
ADMIN
```

Migration must preserve existing users.

The migration must be explicitly planned before execution.

Conceptual migration:

```text
CLIENT
    ↓
USER role
+
CLIENT capability

PROVIDER
    ↓
USER role
+
PROVIDER capability

ADMIN
    ↓
ADMIN platform role
```

Existing data relationships must continue resolving correctly.

Special attention is required because existing entities currently reference Client/Provider Profiles under assumptions derived from the fixed-role model.

The migration must be reviewed against:

- Jobs
- Services
- Proposals
- Connections
- Payments
- Reviews
- Messages
- Disputes
- Notifications

No destructive migration should be executed until the dependency analysis is complete.

---

# 27. Explicit Non-Goals for This Module

Do not build the following unless required by implementation dependencies:

- Government ID verification provider integration
- KYC
- Device fingerprinting
- Automated fraud scoring
- Apple/social providers beyond Google
- Full permissions UI
- Full Super Admin configuration system
- Marketplace-specific provider onboarding UI
- Payment architecture changes
- Mobile refresh-token redesign

The architecture should allow these later.

---

# 28. Production Requirements

Before Module 01 is considered complete:

### Configuration

- Required environment variables validated at startup
- Google OAuth configuration explicitly validated when enabled
- No unsafe localhost fallback
- Production Redis available for distributed throttling

### Availability

- Health endpoint remains functional
- Graceful shutdown remains functional

### Security

- Password hashing remains Argon2
- Refresh rotation remains secure
- Reuse detection remains functional
- RBAC enforced server-side
- Admin privilege cannot be self-assigned
- Capability checks cannot be bypassed through frontend state
- Verification state cannot be client-controlled

### Portability

- No environment-specific business logic
- No hardcoded deployment domains
- Configuration remains environment-driven

---

# 29. Testing Requirements

Module 01 requires:

## Unit tests

- Password hashing
- Login
- Refresh rotation
- Refresh reuse detection
- Email verification
- Password reset
- RBAC permission checks
- Capability checks
- Admin privilege restrictions
- Account status restrictions
- Rate-limit dimensions
- Authentication method linking
- Duplicate external identity prevention
- Idempotent operations

## Integration tests

Test against the actual NestJS + Prisma integration setup when the approved test database is available.

Critical scenarios:

```text
1. Register User

2. Verify email

3. Activate Provider capability

4. Same User can hire and provide

5. User cannot self-deal

6. Unauthorized user cannot perform admin action

7. Admin permission boundaries work

8. Suspended user loses required access

9. Google identity links to the correct User

10. Duplicate Google identity cannot create two users

11. Refresh token reuse revokes required sessions

12. Concurrent capability activation does not duplicate state
```

## Security / concurrency tests

Explicitly test:

- Concurrent registration attempts
- Authentication-method linking races
- Duplicate capability activation
- Role escalation attempts
- Forged capability context
- Access using a token issued before suspension
- Self-dealing attempts through direct API calls

---

# 30. Definition of Done

Module 01 is complete when:

```text
✓ One User can have CLIENT and PROVIDER capabilities

✓ One User can securely use multiple authentication methods

✓ Email/password authentication works

✓ Google authentication works

✓ Sessions retain secure rotation and reuse detection

✓ Email verification works

✓ Strict RBAC exists and is enforced server-side

✓ USER, ADMIN, and SUPER_ADMIN authority is modeled correctly

✓ Admin privileges cannot be self-assigned

✓ Marketplace capabilities are independent from platform roles

✓ Provider capability can be activated safely

✓ User status transitions are implemented and enforced

✓ Suspended/disabled users cannot retain inappropriate access

✓ Identity-related actions have appropriate idempotency protection

✓ Rate limiting works across production instances through Redis

✓ Self-dealing is structurally blocked

✓ Sensitive administrative actions are audited

✓ Existing identity data is migrated safely

✓ Existing tests are updated

✓ New unit, integration, concurrency, and security tests pass

✓ Typecheck passes

✓ Lint passes

✓ No existing module behavior is silently broken
```

---

# Final Implementation Principle

The central model for Marché is:

```text
                    ONE PERSON
                         │
                         ▼
                    ONE USER
                         │
         ┌───────────────┼────────────────┐
         │               │                │
         ▼               ▼                ▼
 Authentication     Capabilities      Platform Roles
         │               │                │
  Password/Google   Client/Provider  User/Admin/Super Admin
                         │
                         ▼
                  Verification & Trust
```

This is now a solid enough foundation to begin the **Module 01 production refactor**.

The first implementation step should **not** be coding. It should be a **schema and dependency audit of the existing Identity/Profile/Marketplace relationships**, followed by a precise migration plan. The role change touches existing foreign keys and assumptions, so that migration needs to be designed before Claude Code starts modifying the Prisma schema.
