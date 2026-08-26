# Module 01 — Identity Implementation Contract

_This document locks the design decisions implementation will follow. It resolves every open question left by `module1-migration-plan.md` with a specific, final answer. Nothing here is aspirational or optional — where the migration plan presented alternatives, this contract picks one. No code, schema, or migration has been written yet. Implementation must not deviate from this contract without a new review._

---

## 0. The Four Concepts — Definitions That Must Not Be Conflated

Every subsequent section depends on keeping these four things separate. Code, DTOs, database columns, and variable names must reflect this separation — no field or check may silently mix two of these.

| Concept                    | Question it answers                                                     | Where it lives                                                                                               | Who can change it                                                       | Changes how often                                                                                       |
| -------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| **Identity**               | Which person is this?                                                   | `User.id` (unchanged, permanent)                                                                             | Never changes post-creation                                             | Never                                                                                                   |
| **Capability**             | What marketplace activities can this identity perform?                  | `UserCapability` rows (`CLIENT`, `PROVIDER`)                                                                 | Granted by the identity itself (self-service activation) or by an admin | Rare — activated once, essentially permanent thereafter (no deactivation flow in this module, see §3.4) |
| **Active UI mode**         | Which capability's experience is this identity currently viewing/using? | Client-side only — not a database column, not a JWT claim, not sent to the backend as an authorization input | The identity, freely, at any time                                       | As often as the user clicks the switcher                                                                |
| **Role / RBAC permission** | What platform-operator authority does this identity have?               | `User.platformRole` (`USER`, `ADMIN`, `SUPER_ADMIN`) + permission checks derived from it                     | Only an authorized admin action (§8), never self-service                | Very rare                                                                                               |

**The single sentence that governs every ambiguous case in this document:** _Authorization is always computed from Identity + Capability + Role, resolved fresh from the database on every request. Active UI mode is never an input to any authorization decision — it is presentation state, full stop._

---

## 1. Identity

- `User.id` is the one and only identity primitive. It does not change meaning under this refactor.
- A person has exactly one `User` row (unchanged from today — no multi-account merging is in scope; account linking in §7 prevents a _second_ `User` row from being created for the same real person, it does not merge existing duplicates).
- `Profile` remains 1:1 with `User`, unchanged in shape (confirmed role-agnostic in the migration plan, §1.1). Profile is identity-scoped data (bio, avatar, portfolio, etc.), not capability-scoped — a single Profile row serves whichever capability is active.

---

## 2. Capabilities

### 2.1 Model

- `UserCapability { id, userId FK→User (Cascade), capability enum(CLIENT|PROVIDER), activatedAt, createdAt }`, unique on `(userId, capability)`.
- A `User` may hold zero, one, or both capability rows. Zero is a valid, real state (a freshly-registered user before their first activation completes — see §2.2).

### 2.2 Registration — final decision

- **Registration requires selecting exactly one initial capability**, exactly as today's flow does (`RegisterDto.role: 'CLIENT' | 'PROVIDER'`). This is the smallest change to the signup form and preserves the existing, tested registration UX.
- On successful registration, exactly one `UserCapability` row is created inside the same transaction that creates `User` and `Profile` (mirroring the existing `$transaction` in `auth.service.ts:126-133`).
- Registration **does not** offer a "select both" option at signup. A user who wants both capabilities activates the second one afterward via §2.3. This keeps the initial signup flow decision-light and matches `module1.md` §5's framing of Provider activation as a distinct, later step even for a CLIENT-first registrant — and symmetrically, a PROVIDER-first registrant activates CLIENT the same way if they ever want to hire.

### 2.3 Capability activation (post-registration)

- A new endpoint, `POST /identity/capabilities/:capability/activate`, grants the requested capability to the caller's own identity.
- Activation is **idempotent**: activating an already-held capability is a no-op success, not an error (see §10 — this is one of the named idempotency-sensitive operations).
- Activation requirements per `module1.md` §5:
  - Valid, ACTIVE, non-deleted account (enforced by the existing `JwtAuthGuard`/`JwtStrategy` status check — no new mechanism needed).
  - Verified email (`Verification(EMAIL, VERIFIED)` — see §9).
  - No additional gating (portfolio completeness, category setup, etc.) is enforced by Module 01 itself — those checks, if any, belong to Profiles/Marketplace per `module1.md` §5's explicit module-boundary statement, and are out of scope for this contract.
- Activation is a **grant only** in this module. Deactivation/revocation of a capability by the user themselves is explicitly out of scope for Module 01 (not a security gap — a held-but-unused capability has no attack surface; deactivation is a product feature that can be added later without touching the authorization model this contract defines).

### 2.4 Capability checks — the two functions

- `profile-access.util.ts`'s `assertProviderRole`/`assertClientRole` are replaced by two functions with the same call-site shape but capability-set semantics:
  ```ts
  assertHasCapability(capabilities: Capability[], required: 'CLIENT' | 'PROVIDER'): void
  ```
  Every existing call site (`services.service.ts`, `jobs.service.ts`, `proposals.service.ts`, `connections.service.ts`, `direct-contracts.service.ts`, the five profile-sub-entity services, `referrals.service.ts`) is updated to pass the caller's full capability set (loaded once per request, see §2.5) instead of a scalar `profile.user.role`.
- `saved-providers.service.ts`'s two inline checks (§1.3 of the migration plan) are migrated onto this same function — no inline role string comparisons remain anywhere in the codebase after this module ships.
- `payments.service.ts:187`'s binary ternary becomes: if the caller holds only one relevant capability, return that capability's view (unchanged behavior for single-capability users — this must not regress); if the caller holds both, return the merged view (both client-side and provider-side payment history, clearly labeled). This is a genuine new code path, not a signature change, and needs its own test coverage (§ "Testing" is covered by the migration plan; this contract just fixes the required behavior).

### 2.5 How capabilities reach the request

- `JwtStrategy.validate` (already re-fetches the `User` from DB on every request, per the existing, correctly-designed status-check pattern) additionally loads the caller's `UserCapability` rows in the same query and attaches them to `AuthenticatedUser` as `capabilities: Capability[]`.
- The JWT payload itself is **not** expanded to carry capabilities. Capabilities are always read live from the database on every request, exactly like `User.status` is today — never trusted from token contents. This preserves the existing, audited security property that a database-side change (activating a capability, or — hypothetically — revoking one in the future) takes effect on the very next request, not after token expiry.

---

## 3. Active UI Mode

### 3.1 Definition

- Active mode is **purely a frontend presentation concern**: which capability's dashboard, navigation, and terminology the identity is currently viewing.
- Active mode is **never** sent to the backend as part of an authorization decision, and no backend endpoint reads or trusts a client-supplied "current mode" value for anything security-relevant.

### 3.2 Where it lives

- Stored client-side only — `AppContext.tsx`'s state plus `localStorage` for persistence across sessions (extending the existing pattern already used for per-role dashboard state, per the migration plan §1.6), keyed by `User.id`, not by capability.
- `AppContext`'s `role: 'client' | 'vendor'` scalar is replaced by two independent pieces of state:
  - `capabilities: Set<'client' | 'vendor'>` — mirrors the backend's `UserCapability` rows, fetched on login/session-restore.
  - `activeMode: 'client' | 'vendor'` — which one is currently being presented. Must always be a member of `capabilities` (if a user's capability set ever changes such that `activeMode` is no longer valid — not expected to happen post-launch since deactivation is out of scope per §2.3 — the app falls back to any remaining capability).

### 3.3 Switching

- A capability-holding user switches active mode via UI action (the existing mode-switcher pattern the frontend already has for the demo role-switcher, per the migration plan §1.6, extended to be the real mechanism).
- Switching active mode never calls the backend and never changes any database state. It is exactly as cheap and reversible as toggling a client-side view filter.
- A user who holds only one capability does not see a switcher at all — this preserves the current single-capability UX exactly as it is today, with zero added complexity for the (initially, universal) single-capability user.

### 3.4 Why this is not "capability" and not "role"

- Active mode answers "what am I looking at right now," which has no bearing on "what am I allowed to do." A CLIENT-mode user who somehow issues a request that only makes sense for a PROVIDER action is rejected by the backend's capability check (§2.4) regardless of what the frontend currently displays — this is the concrete meaning of `module1.md` §7's _"Frontend visibility is never authorization."_
- Backend authorization logic must never contain a parameter, header, or body field named anything like `mode`, `currentRole`, or `viewAs`. If a future implementation needs to know "is this specific request a client-side action or a provider-side action," that must be derivable from the resource being acted on (e.g., "is this profile the `clientProfileId` or the `providerProfileId` on this Connection") — never from a client-asserted flag.

---

## 4. Roles / RBAC (Platform Authority)

### 4.1 Model

- `User.platformRole: 'USER' | 'ADMIN' | 'SUPER_ADMIN'`, default `USER`. A single column on `User`, not a join table (per the migration plan §2.1's YAGNI reasoning — three fixed values, single assignment per user, no product requirement for multi-role stacking).
- `platformRole` is completely independent of `UserCapability`. An `ADMIN` may or may not also hold `CLIENT`/`PROVIDER` capabilities; nothing in this contract restricts that combination (the migration plan's backfill assigns existing admins no capability only because current production data shows none transacted — this is a data-migration decision, not a rule that admins can never hold capabilities).

### 4.2 Enforcement — declarative, not scattered

- A new `@RequirePlatformRole(...)` decorator + `PlatformRoleGuard`, applied at the controller/route level, replaces the current pattern of inline `if (role !== 'ADMIN') throw ...` checks duplicated across `audit.service.ts`, `disputes.service.ts`, and `marketplace-access.util.ts`'s `assertAdminRole`.
- `PlatformRoleGuard` reads `request.user.platformRole` (populated by `JwtStrategy`, loaded fresh from DB on every request, same pattern as §2.5) and compares against the decorator's required role(s), with `SUPER_ADMIN` implicitly satisfying any `ADMIN`-level requirement (strict superset, not a separate permission set to duplicate).
- **This is a genuine, in-scope refactor** of `audit.service.ts`'s and `disputes.service.ts`'s existing inline checks and `marketplace-access.util.ts`'s `assertAdminRole` — all three become callers of the same guard instead of re-implementing the same string comparison. This directly satisfies `module1.md` §7.1's requirement to move away from scattered inline checks, using the exact decorator pattern that section explicitly permits as an implementation detail.
- Resource-ownership checks (`assertOwnership`, party-membership checks on Connections/Disputes) remain exactly where they are today — inside services, not folded into the role guard. `module1.md` §7's two-layer model (RBAC/capability check, then ownership check) is preserved as two distinct mechanisms, not merged into one.

### 4.3 Permissions

- Per the migration plan §2.1's explicit deferral: **no `Permission`/`RolePermission` tables are created in this phase.** `ADMIN` and `SUPER_ADMIN` are enforced as coarse role checks only (`@RequirePlatformRole('ADMIN')`, `@RequirePlatformRole('SUPER_ADMIN')`).
- The `@RequirePlatformRole` decorator's signature is deliberately written to accept a role name today but is structured so that a future `@RequirePermissions(...)` decorator can be added alongside it without changing `PlatformRoleGuard`'s existing call sites — this is the one piece of forward-compatibility this contract allows, because it costs nothing now (a decorator name and a guard class) and avoids a breaking change later. It is not a permissions system — no permission is defined, stored, or checked in this phase.

---

## 5. Admin Provisioning

- No public registration path can ever produce `platformRole !== 'USER'` — `RegisterDto` has no `platformRole` field at all (not merely validated against an allow-list; the field does not exist in the DTO, so `whitelist: true` on the global `ValidationPipe` rejects it outright if a client attempts to send it).
- **Bootstrap mechanism (final decision):** a one-time, manually-invoked script (`packages/db/scripts/bootstrap-super-admin.mjs` or equivalent, following the existing `prepare-test-db.mjs` script convention) that:
  1. Requires an explicit `BOOTSTRAP_SUPER_ADMIN_EMAIL` env var to be set (never a default, never read from request input).
  2. Promotes the named, already-registered user to `SUPER_ADMIN` directly via Prisma.
  3. Writes an audit log entry (§ below) with `actor: 'system-bootstrap-script'`, since there is no authenticated admin actor to record for the very first promotion.
  4. Refuses to run if any `SUPER_ADMIN` already exists (prevents accidental re-use as a general promotion tool — this script is for the one bootstrap event only).
- **All subsequent role elevation** (promoting a `USER` to `ADMIN`, or an `ADMIN` to `SUPER_ADMIN`) happens through an authenticated endpoint, `PATCH /admin/users/:id/platform-role`, guarded by `@RequirePlatformRole('SUPER_ADMIN')` — only a Super Admin can grant or change platform roles, never an `ADMIN`, never the user themselves.
- Every role elevation (bootstrap or endpoint-driven) writes an `AuditLog` row recording: actor `User.id` (or `'system-bootstrap-script'` for the one bootstrap case), target `User.id`, previous `platformRole`, new `platformRole`, timestamp — satisfying `module1.md` §8's seven-point audit requirement exactly. No schema change to `AuditLog` is needed (its `eventType: string` design already accommodates a new event type, per the migration plan's confirmation).

---

## 6. Self-Dealing Prevention — Backend-Enforced Invariants

**Governing rule, stated once, applied everywhere:** _a marketplace transaction must involve two distinct `User.id` values on its two economic sides. Every self-dealing check — without exception — compares resolved `User.id` values, never `Profile.id` values. `Profile.id` is a data-model detail of who is transacting, not the canonical identity; comparing `Profile.id`s directly is not an acceptable substitute for comparing `User.id`s, even where the two happen to coincide. Checks must never trust which capability/mode the request claims to be acting under._

This section governs self-dealing specifically. The same principle — canonicalize to `User.id` before comparing, never compare `Profile.id`s as a proxy — also applies to every other authorization decision in this contract (capability checks in §2.4, ownership checks in §4.2, RBAC in §4): wherever code today reads `profile.user.role` or resolves a caller's identity through a `Profile` relation, the comparison that matters is the `User.id` at the end of that chain, and that is what must be logged, tested, and reasoned about — `Profile.id` is merely the FK path used to reach it.

### 6.1 `Profile.id` is a path to `User.id`, not a substitute for it

`Profile.userId` is `@unique` (confirmed in the migration plan §1.1), so a `Profile.id` maps to exactly one `User.id`, always — this is why a `Profile.id ≠ Profile.id` comparison happens to be equivalent to a `User.id ≠ User.id` comparison today. **That equivalence is a property of the current schema, not a license to write the comparison in terms of `Profile.id`.** Implementation must resolve to `User.id` explicitly at each check (via the already-loaded `profile.user.id` / `profile.userId`), both because it is the canonical, self-documenting form or a reviewer to verify, and because it removes any dependency on the `Profile.userId` uniqueness constraint continuing to hold exactly as-is if the data model is ever extended later. The `CHECK` constraint in §6.2 is the one place a `Profile.id` comparison is used directly, and it is explicitly justified there as a defensive backstop, not the primary mechanism.

### 6.2 Enforcement order — checked early, re-checked defensively downstream

Self-dealing is prevented **primarily at the three points where a transaction is actually initiated or committed** — proposal submission, proposal acceptance, and direct-contract creation. Every other downstream entity (`Connection`, `Payment`, `Review`) inherits the guarantee transitively and additionally carries its own defensive re-check or structural constraint, so a bug in one upstream check does not silently produce a self-dealing row further down the pipeline.

| Entity                                                               | Invariant                                                                             | Enforcement mechanism                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Role                                                                                                                                 |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **Proposal** (submission) — _primary enforcement point_              | The submitting provider's `User.id` must not equal the job-posting client's `User.id` | App-level check in `ProposalsService.submit()`, before insert: resolve `Job.clientProfileId → Profile.userId` and the caller's own `User.id` (already available from the authenticated request, no extra lookup), compare directly as `User.id`s. Cannot be a same-table DB `CHECK` (crosses `Job`↔`Proposal`), so this is enforced in the service, inside the same transaction as the insert, re-derived from the database on every call.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | **Primary** — this is the earliest point a self-dealing attempt can occur, and where it should be rejected first.                    |
| **Proposal** (acceptance) — _primary enforcement point, re-verified_ | The same `User.id ≠ User.id` check, re-run, not just trusted from submission time     | The existing `accept()` transaction (`proposals.service.ts:172-241`) already re-reads `Job` and `Proposal` fresh inside the transaction — the same `User.id` comparison is added as one additional guard clause in that existing read, costing one comparison, no new query. This re-check exists because acceptance is a second, independent transaction from submission, and this contract does not assume the submission-time check is the only line of defense.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | **Primary**, defense-in-depth against submission-time check being bypassed, skipped, or (in a future refactor) accidentally removed. |
| **Direct Contract** (creation) — _primary enforcement point_         | Client and provider must resolve to distinct `User.id`s                               | `DirectContractsService`'s existing `assertClientRole`/`assertProviderRole` call sites (migration plan §1.3) already resolve both profiles' owning `User` rows — add the same `User.id ≠ User.id` comparison there, at creation time, before any row is written. This is the direct-hire equivalent of "submission," since a direct contract has no separate proposal-submission step.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | **Primary** — the only initiation point for this flow.                                                                               |
| **Connection**                                                       | `clientProfileId ≠ providerProfileId`                                                 | **Database-level `CHECK` constraint** on the `Connection` table (`CHECK (clientProfileId <> providerProfileId)`) — kept as an additional structural invariant per explicit instruction, in the same spirit as the existing `@@unique([jobId, providerProfileId])` on `Proposal` and the ADR-006 conditional-claim pattern. This is a `Profile.id` comparison, not a `User.id` comparison — acceptable _only_ here, and only as a defensive backstop, because (a) it is exact by construction per §6.1's uniqueness fact, and (b) a `CHECK` constraint cannot itself perform a cross-table join to compare `User.id`s directly, so this is the closest a database-level guarantee can get. It must never be treated as the primary mechanism — Proposal acceptance (row 2 above) is what should actually reject a self-dealing attempt before a `Connection` row is ever attempted; this `CHECK` exists to catch what should already be impossible. | **Defensive backstop only.**                                                                                                         |
| **Payment**                                                          | Inherits the Connection invariant                                                     | Payment is always created from an existing `Connection` (`connectionId` FK, migration plan §1's finding on `payments.service.ts:70`) — since `Connection` cannot have equal `clientProfileId`/`providerProfileId` (row above), a self-dealing payment cannot be constructed. No new check is added here; this row documents the inherited guarantee for reviewability.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | **Inherited, documented, no new code.**                                                                                              |
| **Review**                                                           | Reviewer's `User.id ≠` the `User.id` owning `revieweeProfileId`                       | Defensive re-check added in `ReviewsService`'s existing eligibility check (`reviews.service.ts:57`), alongside the existing "caller is a party to this COMPLETED connection" check — resolve both sides to `User.id` and compare, rather than relying solely on the inherited Connection-level guarantee. Reviews are added as an explicit re-check (not merely inherited, unlike Payment) because review eligibility logic sits further from Connection creation in the codebase and is a place a future edit is more likely to introduce a regression unnoticed.                                                                                                                                                                                                                                                                                                                                                                                 | **Defensive re-check.**                                                                                                              |

### 6.3 What this explicitly rules out

- No self-dealing check may ever read active UI mode, a request header, or any client-supplied "I am acting as X" claim. Every check above resolves ownership from database foreign keys only, per the governing rule.
- No self-dealing check is written as a `Profile.id` comparison **except** the `Connection` `CHECK` constraint, which is explicitly and narrowly justified in §6.2 as a defensive backstop. Every other check — Proposal submission, Proposal acceptance, Direct Contract creation, and the Review re-check — is written as an explicit `User.id ≠ User.id` comparison, not inferred from `Profile.id` inequality, even though the two are equivalent today per §6.1's uniqueness fact.

---

## 7. OAuth Account Linking (Google)

### 7.1 Model

- `AuthenticationMethod { id, userId FK→User (Cascade), provider enum(EMAIL_PASSWORD|GOOGLE), providerAccountId (nullable — Google's `sub` claim, unique when present), createdAt }`.
- Unique constraint: `(provider, providerAccountId)` where `providerAccountId IS NOT NULL` — no two `User` rows can ever claim the same Google account.
- `EMAIL_PASSWORD` rows are backfilled for every existing user at migration time (one row per existing user, `providerAccountId = null`) so the table is a complete authentication-method ledger from day one, not a Google-only afterthought.

### 7.2 Linking rule — final decision

- **Google's verified `sub` (subject/account ID) is the only trusted linking key — never the email address alone.**
- Flow on `Continue with Google`:
  1. Verify the Google ID token's signature and claims server-side (never trust a client-asserted email/sub).
  2. Look up `AuthenticationMethod` by `(provider='GOOGLE', providerAccountId=sub)`.
     - **Found** → authenticate as that `User`. Done — no email comparison needed at all for a returning Google user.
     - **Not found** → proceed to step 3.
  3. Look up `User` by the Google-verified email address.
     - **No existing `User` with that email** → create a new `User` (with a `platformRole='USER'` default and **no capability rows** — capability selection happens the same way it does for email/password registration, via an explicit follow-up step, not silently inferred from OAuth) plus a `Profile` plus the new `AuthenticationMethod(GOOGLE, sub)` row, all in one transaction.
     - **An existing `User` already has that email, via `EMAIL_PASSWORD`** → **do not silently link.** Require an explicit confirmation step: the existing account must prove ownership (e.g., prompted to log in with their existing password once, or a confirmation email sent to that address) before the `AuthenticationMethod(GOOGLE, sub)` row is attached to that `User.id`. This is the concrete mechanism satisfying `module1.md` §12's _"must not blindly occur merely because a client sends an email address."_
- **Why `sub`, not email, is the primary key for lookup:** an email address can be changed at the provider, reused, or (in edge cases) not verified by every provider — Google's `sub` is permanent and provider-guaranteed unique per account, so it is the only value trustworthy enough to be a unique constraint. Email is used only for the one-time discovery of "does an existing password-based account plausibly belong to this person," which is exactly why that path requires an extra proof step and the `sub`-based path does not.

### 7.3 Session behavior

- Once linked, Google login produces the exact same session artifacts as password login — same `Session` row shape, same JWT payload shape (`{sub: User.id, ...}`), same refresh-token rotation mechanism. `module1.md` §11's requirement that Google auth _"integrate into the same internal session model as password login"_ is satisfied by construction: nothing downstream of successful authentication (session creation, capability loading, RBAC) branches on which `AuthenticationMethod` was used.

---

## 8. Verification

### 8.1 Model

- `Verification { id, userId FK→User (Cascade), type enum(EMAIL|PHONE|IDENTITY|PROVIDER|CREDENTIAL|BUSINESS), status enum(PENDING|VERIFIED|REJECTED|EXPIRED), verifiedAt, createdAt }`.
- Only `EMAIL` is written by Module 01. The other five enum values exist in the schema now (so no future migration is needed to add them) but no code path creates them in this phase — this is the `module1.md` §14 "architecture-ready" distinction, made concrete.

### 8.2 Compatibility decision (from the migration plan, now finalized)

- `User.emailVerifiedAt` **is kept** as a denormalized, fast-path read column. `AuthService.login`'s existing null-check against it is **not** rewritten.
- The write path changes: whatever code sets `emailVerifiedAt` today also creates/updates the corresponding `Verification(EMAIL, VERIFIED, verifiedAt)` row, in the same transaction. `Verification` becomes the system of record; `emailVerifiedAt` becomes a read-optimized cache of exactly one fact from it (`type=EMAIL AND status=VERIFIED`).
- This is a deliberate, final decision to avoid touching the highest-traffic authenticated code path (`login`) for a purely architectural reason with no functional benefit — consistent with the migration plan's §2.3 recommendation and CLAUDE.md's instruction not to rewrite working, tested code without a concrete correctness reason.

### 8.3 Trust boundary

- No `Verification` row's `status` is ever settable by a value the client supplies directly. Every transition (`PENDING → VERIFIED`, `PENDING → REJECTED`, `→ EXPIRED`) is either system-driven (email token redemption, exactly as today's `verifyEmail()` flow) or, for future types, admin/vendor-driven — never a bare `PATCH` accepting an arbitrary status from the caller.

---

## 9. Rate Limiting

No structural change from the existing, correctly-designed system (`RedisThrottlerStorage`, `@nestjs/throttler`, the Stage 2 production-hardening work already merged). This contract adds two identity-specific dimensions per `module1.md` §19, both layered on the existing storage, not a new mechanism:

| Flow                                  | Dimensions                                    | Mechanism                                                                                                                                                                                                                                                                                                 |
| ------------------------------------- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Login                                 | IP + email                                    | Already implemented today (`@Throttle` IP-keyed + `EmailThrottlerGuard` email-keyed) — unchanged.                                                                                                                                                                                                         |
| Registration                          | IP + email                                    | Already implemented today — unchanged.                                                                                                                                                                                                                                                                    |
| Password reset                        | IP + email + cooldown                         | Already implemented today (`EmailThrottlerGuard` on `forgot-password`) — the "cooldown" language in `module1.md` §19 describes the existing behavior (a fixed window between allowed requests), not a new mechanism.                                                                                      |
| **Capability activation** (new, §2.3) | User ID + IP backstop                         | New: a per-user throttle key (not email-keyed, since the caller is already authenticated) on `POST /identity/capabilities/:capability/activate`, backed by the same `RedisThrottlerStorage`. Prevents rapid repeated activation-idempotency-check hammering; not a fraud-prevention mechanism (see §9.1). |
| **Admin role elevation** (new, §5)    | User ID (the Super Admin actor) + IP backstop | New: same pattern, on `PATCH /admin/users/:id/platform-role`.                                                                                                                                                                                                                                             |

### 9.1 Explicit non-goal

Per `module1.md` §20, none of the above is fraud detection. No device fingerprinting, no cross-account correlation, no automated suspicion scoring is added in this module. Rate limiting here exists only to bound request volume, exactly as it does today.

### 9.2 Production requirement — unchanged, reaffirmed

`NODE_ENV=production` with no `REDIS_URL` set continues to fail application startup (already implemented in `config/env.validation.ts` from prior hardening work). This contract adds no new exception to that rule — the two new throttle dimensions above use the same Redis-backed storage and are therefore covered by the existing boot-time guarantee automatically.

---

## 10. Idempotency

Per `module1.md` §21's explicit instruction not to add a blanket idempotency-key requirement to every endpoint, this contract names exactly the operations that need it and states the mechanism for each — no generic middleware.

| Operation                                              | Idempotency mechanism                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Why structural guarantees are/aren't sufficient |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| **Registration**                                       | Already solid today — see the migration plan's confirmation that `User.email`'s `@unique` constraint is the backstop, with the app-level duplicate-response design layered on top. The one open bug (unhandled `P2002` race, flagged in the original Module 1 production-readiness audit) is a **pre-existing defect to fix during this refactor**, not a new requirement — fixing it is in scope for this module's implementation, using the exact mechanism already recommended in that audit (catch the constraint violation, fall through to the existing duplicate-response branch). |
| **Capability activation** (§2.3)                       | `UserCapability`'s `@@unique(userId, capability)` constraint makes a retried activation request a guaranteed no-op at the database level — the service catches the constraint violation (or does an upsert) and returns the same success response either way. No separate idempotency-key header is needed; the natural key (`userId` + `capability`, both already present in the request) is sufficient.                                                                                                                                                                                 |
| **AuthenticationMethod linking** (§7)                  | `(provider, providerAccountId)`'s unique constraint (where not null) is the structural guarantee — a retried Google-login callback resolves to the same existing row, not a duplicate.                                                                                                                                                                                                                                                                                                                                                                                                    |
| **Verification submission** (§8)                       | Not a new idempotency concern in this phase — only `EMAIL` is implemented, and its token-redemption flow is already correctly single-use (`deleteById` on success, per the original Identity audit).                                                                                                                                                                                                                                                                                                                                                                                      |
| **Sensitive account transitions** (role elevation, §5) | Not naturally idempotent by a unique constraint (setting the same role twice has no natural key to dedupe on) — but also not harmful if retried: setting `platformRole='ADMIN'` when it's already `'ADMIN'` is a safe no-op update. The audit log will record two identical entries for a genuine double-submission, which is acceptable (an audit trail showing "confirmed twice" is not a correctness bug) and does not need a dedicated idempotency key.                                                                                                                               |

**Explicitly out of scope**: Payments' and marketplace's existing idempotency mechanisms (`Payment.connectionId` uniqueness, `Proposal`'s `@@unique(jobId, providerProfileId)`, the ADR-006 conditional-claim pattern) are untouched by this module and must remain exactly as they are — Module 01 does not modify any file under `payments/`, `proposals/`, `jobs/`, or `direct-contracts/` beyond the specific, named call-site updates in §2.4 and §6.2.

---

## 11. What This Contract Deliberately Does Not Decide

Consistent with `module1.md` §27's non-goals and the migration plan's open questions, the following remain explicitly out of scope for Module 01's implementation and are not blocked by anything in this contract:

- The exact frontend visual design of the mode switcher (§3.3) — only its behavioral contract (client-side only, never sent to backend as an auth input) is fixed here.
- Capability deactivation (§2.3) — grant-only in this phase.
- Fine-grained permissions beyond the three-value `platformRole` (§4.3).
- Any authentication provider beyond Google (§7).
- Any verification type beyond EMAIL (§8.1).
- KYC, device fingerprinting, fraud scoring (§9.1).

---

## 12. Summary Table — Decision Lock

| Question                                          | Decision                                                                                                                                                                                                                                                                   |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Can one `User` hold both CLIENT and PROVIDER?     | Yes, via two independent `UserCapability` rows                                                                                                                                                                                                                             |
| Does registration require picking one capability? | Yes — mirrors today's flow exactly                                                                                                                                                                                                                                         |
| Is active UI mode sent to the backend?            | Never                                                                                                                                                                                                                                                                      |
| Does the JWT carry capabilities?                  | No — loaded fresh from DB every request, same pattern as `User.status`                                                                                                                                                                                                     |
| Are platform roles a join table or a column?      | Column on `User` (`platformRole`), three fixed values                                                                                                                                                                                                                      |
| Are fine-grained permissions built now?           | No — deferred, decorator structured to allow adding them later without a breaking change                                                                                                                                                                                   |
| How is the first Super Admin created?             | One-time gated script, refuses to run if a Super Admin already exists                                                                                                                                                                                                      |
| How is self-dealing prevented?                    | Primarily by explicit `User.id ≠ User.id` checks at proposal submission, proposal acceptance, and direct-contract creation; the Connection-level `CHECK (clientProfileId <> providerProfileId)` and the Review re-check are defensive backstops, not the primary mechanism |
| What is the Google-linking key?                   | Google's `sub`, never email alone; existing-email-match requires an explicit proof step                                                                                                                                                                                    |
| Is `User.emailVerifiedAt` replaced?               | No — kept as a denormalized read cache; `Verification` becomes the write-side system of record                                                                                                                                                                             |
| Is a blanket idempotency-key system added?        | No — three specific operations get specific, structural mechanisms                                                                                                                                                                                                         |

---

Stopping here per instructions — no code, schema, or migration has been written. Waiting for review before implementation begins.
