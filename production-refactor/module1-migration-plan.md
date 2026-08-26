# Module 01 — Identity Refactor: Schema & Dependency Audit + Migration Plan

_Inspection and planning only. No schema, migration, or code changes were made in producing this document. All findings below are verified against the current codebase (branch `feature/module1-identity-refactor`, based on `main`); recommendations are labeled as such._

This document is the mandatory first step called for at the end of `module1.md`: _"a schema and dependency audit of the existing Identity/Profile/Marketplace relationships, followed by a precise migration plan"_ — before any Prisma schema edit or service code is touched.

---

## 1. What Actually Depends on `User.role` Today

### 1.1 `Profile` is already role-agnostic — the good news

`Profile` (`schema.prisma:184-250`) is 1:1 with `User` (`userId String @unique`), and its own fields carry **no role or capability information whatsoever** — `username, displayName, headline, bio, avatarMediaId, location, timezone, socialLinks, experienceLevel, primaryGoal, workPreferences, orgSize, website, visibility, availabilityStatus, nextAvailableDate, verifiedAt`. The schema's own comment states the design intent directly: _"One shared Profile table for both Client and Provider roles, not separate ProviderProfile/ClientProfile tables."_

Confirmed by tracing registration: `RegisterDto.role` is written onto `User.create` (`auth.service.ts:128`) but is **never passed** into `ProfilesService.createForNewUser` (`auth.service.ts:131`), and `createForNewUser` (`profiles.service.ts:53-59`) stores only `{ userId, displayName }`. Profile creation reads and stores nothing role-derived today.

**This means the hardest part of a capability migration — giving every user a place to hold provider-side data regardless of their original registration role — already exists and requires no schema change.** A user who activates the PROVIDER capability after registering as CLIENT already has a Profile row ready to receive `Service`, `Portfolio`, `Experience`, etc. rows the moment the capability is granted.

### 1.2 Every FK to `Profile.id` — exhaustive list

15 foreign keys across 11 models point at `Profile.id`:

| Model.field                       | onDelete    | What it represents                              |
| --------------------------------- | ----------- | ----------------------------------------------- |
| `Portfolio.profileId`             | Cascade     | provider-only content                           |
| `Experience.profileId`            | Cascade     | provider-only work history                      |
| `Education.profileId`             | Cascade     | provider-only degree entry                      |
| `Certification.profileId`         | Cascade     | provider-only credential                        |
| `UserSkill.profileId`             | Cascade     | provider-only skill tag                         |
| `UserLanguage.profileId`          | Cascade     | provider-only language                          |
| `Service.profileId`               | Cascade     | the provider's discoverable listing             |
| `Job.clientProfileId`             | Cascade     | the client who posted the requirement           |
| `Proposal.providerProfileId`      | Cascade     | the provider who submitted an offer             |
| `Connection.clientProfileId`      | Cascade     | client side of the hiring relationship          |
| `Connection.providerProfileId`    | Cascade     | provider side of the hiring relationship        |
| `Review.revieweeProfileId`        | **SetNull** | whose reputation is affected; survives deletion |
| `SavedProvider.clientProfileId`   | Cascade     | the client doing the bookmarking                |
| `SavedProvider.providerProfileId` | Cascade     | the provider being bookmarked                   |
| `Referral.referrerProfileId`      | Cascade     | the client sending the invite                   |

None of these FKs are role-typed at the schema level — a `clientProfileId` column is just a `Profile.id` reference with a semantic name. **The schema itself does not need to distinguish "client Profile" from "provider Profile" as different types** — that distinction is entirely enforced in application code today (see §1.3), which is actually favorable for the migration: the schema's shape does not need to change to support one Profile row acting on both sides of the marketplace.

### 1.3 Where role is actually enforced — one choke point, not thirty

Every place that currently gates a client-side or provider-side action does so through **exactly three shared functions** in `apps/api/src/profiles/profile-access.util.ts`:

```ts
getOwnProfileOrThrow(profilesRepository, userId)   // assumes exactly 1 Profile per user — still true, unaffected
assertProviderRole(role: string)                    // throws unless role === 'PROVIDER'
assertClientRole(role: string)                       // throws unless role === 'CLIENT'
assertOwnership(resourceProfileId, callerProfileId) // pure ID equality, role-independent, unaffected
```

Every call site across the codebase (`services.service.ts`, `jobs.service.ts`, `proposals.service.ts`, `connections.service.ts`, `direct-contracts.service.ts`, `portfolio/experience/education/certification/skills.service.ts`, `referrals.service.ts`, `saved-providers.service.ts`) passes a **single scalar** `profile.user.role` into one of these two functions. None of them accept a set/array today.

**This is the single most important finding of this audit**: the migration's backend blast radius is dominated by two functions, not by thirty scattered checks. Every caller of `assertClientRole`/`assertProviderRole` needs to change _how_ it's called (checking capability membership instead of scalar equality), but the call sites themselves — and therefore the business logic surrounding them — do not need to be rewritten, only the assertion functions' signatures and the one line at each call site that invokes them.

**Exceptions — three places that don't go through the shared helpers** and must be found and changed individually:

- `payments.service.ts:187` — `profile.user.role === 'CLIENT' ? listForClient(...) : listForProvider(...)` — a **binary branch with no third option**. Under a capability model, a user holding both capabilities needs this to become "merge both views," not an either/or ternary. This is a genuine logic change, not just a signature change.
- `saved-providers.service.ts:64` — inline `if (role !== 'CLIENT') return false;` inside `isSaved` (should be migrated to the shared helper pattern as part of this work, not left inline).
- `saved-providers.service.ts:119` — `if (target.user.role !== 'PROVIDER')` inside `assertIsProvider` — note this checks the **target's** capability (is the profile being saved actually a provider), not the caller's — this one is conceptually different from the others and needs separate attention: under a capability model, "is this profile a provider" becomes "does this profile's user hold the PROVIDER capability," still a valid single check, just against a set membership instead of a scalar.

### 1.4 `Review` is already capability-agnostic — no change needed

`reviews.service.ts:57` performs **no role assertion at all** — eligibility is purely "COMPLETED connection + caller is a party + hasn't already reviewed." This confirms the schema/service design already treats review-writing as symmetric between the two sides of a Connection, which is exactly the shape a capability model needs. No change required here.

### 1.5 `User`'s other relations — confirmed unaffected

Every other back-reference on `User` (`sessions`, `verificationTokens`, `passwordResets`, `media`, `notifications`, `reviewsWritten`, `sentMessages`, `disputesRaised/Received/Resolved`, `workDiaryEntries`) keys directly off `User.id` and carries no role semantics of its own — verified by reading each target model's FK. **None of these require any schema or service change.** The only relation whose _meaning_ shifts is `User.profile Profile?` itself, and only conceptually (it stops being "your one role's data" and becomes "your one identity's data, usable by either capability") — the FK shape (1:1, optional) does not need to change.

### 1.6 Frontend — the exclusivity assumption is structural, not incidental

`apps/web/src/context/AppContext.tsx` models role as a mutually-exclusive scalar throughout:

- `role: 'client' | 'vendor'` on the `User` type (line 81)
- Two-way scalar mapping functions `backendRoleToUserRole`/`userRoleToBackendRole` (lines 249-256)
- Routing decisions (`/provider/dashboard` vs `/client/dashboard`), profile-switching logic, and even **localStorage keys** (`${LOCAL_STORAGE_KEY}_profile_${currentUser.role}`) are all keyed on this single value (lines 495, 575-582, 609, 685-713, 751).

Fifteen additional frontend files gate rendering on `'client'`/`'vendor'` as mutually exclusive: `ProfileApiSection.tsx`, `AuthPages.tsx`, `client/ContractDetailPage.tsx`, `MessagesPage.tsx`, `MobileTabBar.tsx`, `Sidebar.tsx`, `App.tsx`, `marketplace/PublicProfilePage.tsx`, `provider/MyServicesPage.tsx`, `NotificationsPage.tsx`, `EditProfilePage.tsx`, `profileCompleteness.ts`, `MobileMenuPage.tsx`, `formatNotification.ts`. `App.tsx`, `Sidebar.tsx`, and `MobileTabBar.tsx` almost certainly gate entire navigation trees on this scalar.

**This is the largest single piece of migration work in the entire module** — larger than the backend change. A capability-based backend with a still-scalar frontend `role` field would either lose the "both capabilities" feature entirely at the UI layer or require every one of these ~18 files to be individually re-examined for what "logged in with both capabilities" should render (a persistent mode switch? both nav trees merged? a chosen "active" capability with the other reachable via a switcher?). That's a product/UX decision this audit flags but does not make.

---

## 2. Migration Plan

### 2.1 Schema changes required

**New tables (additive, no destructive change to existing tables):**

- `UserCapability` — `{ id, userId FK→User (Cascade), capability enum(CLIENT|PROVIDER), activatedAt, createdAt }`, unique on `(userId, capability)`. This is the direct database representation of §4 of `module1.md`. One row per active capability, not a bitmask/array column — consistent with this codebase's demonstrated preference for typed relational rows over flexible/bitmask fields (matches the same reasoning already applied to `Service.tags`/`Job.deliverables` as `String[]` rather than Json, per the prior requirements audit).
- `PlatformRole` or a `platformRole` enum column directly on `User` — `USER | ADMIN | SUPER_ADMIN`. **Recommendation**: keep this as a column on `User` (not a join table), since `module1.md` §6 describes platform roles as small, fixed, and non-multi-valued (a user has exactly one platform authority level) — this is a much smaller change than `UserCapability` and does not need its own table. A join table would be over-engineering for a 3-value, single-assignment field, inconsistent with CLAUDE.md's YAGNI guidance.
- Permission/RolePermission tables — **defer**. Per `module1.md` §7.2 and §27 ("Explicit Non-Goals"), exact permissions should be defined before implementing the corresponding admin modules, and a full permissions UI is explicitly out of scope for this module. Building the join tables now, with nothing yet assigning fine-grained permissions, would be exactly the kind of premature abstraction CLAUDE.md warns against. **Recommendation: land `PlatformRole` now (USER/ADMIN/SUPER_ADMIN as a fixed enum), defer `Permission`/`RolePermission` tables until a concrete admin capability needs them.**
- `AuthenticationMethod` — `{ id, userId FK→User (Cascade), provider enum(EMAIL_PASSWORD|GOOGLE), providerAccountId (nullable, Google's sub claim), createdAt }`, unique on `(provider, providerAccountId)` where not null, unique on `(userId, provider)`. Needed for §9-12 of `module1.md` (Google OAuth, secure linking). **This table is required by the migration only if Google OAuth ships in the same phase as the capability model — see §3 Recommended Order below for why this audit recommends decoupling them.**
- `Verification` — `{ id, userId FK→User (Cascade), type enum(EMAIL|PHONE|IDENTITY|PROVIDER|CREDENTIAL|BUSINESS), status enum(PENDING|VERIFIED|REJECTED|EXPIRED), verifiedAt, createdAt }`. Per `module1.md` §14, only `EMAIL` needs to be implemented now; the enum should include the future values so the table doesn't need another migration when PHONE/IDENTITY ship, but only EMAIL-type rows are actually written by Module 1's initial scope. **Recommendation: this can directly replace/coexist with the existing `User.emailVerifiedAt` timestamp — see §2.3 below for the specific compatibility concern.**

**Existing tables — no destructive change required:**

- `User.role` — **do not drop yet**. See §2.2 migration sequencing.
- `Profile` and all 15 FKs listed in §1.2 — **zero schema change needed**. This is the single biggest risk-reduction fact in this audit: the entire marketplace transaction graph (Jobs, Proposals, Connections, Payments, Reviews, Messages, Disputes, Notifications) is already wired through `Profile.id`, not `User.role` — those FKs stay exactly as they are.

### 2.2 Data migration sequencing (existing users)

Conceptual mapping, per `module1.md` §26, verified against actual current data shape:

```
Existing User.role = 'CLIENT'   → platformRole = 'USER'  + UserCapability(CLIENT)
Existing User.role = 'PROVIDER' → platformRole = 'USER'  + UserCapability(PROVIDER)
Existing User.role = 'ADMIN'    → platformRole = 'ADMIN' + no capability rows (an admin account, per current data, has never posted a job or a service under the existing single-role model, so no capability should be inferred for it)
```

This is a straightforward, lossless, one-time backfill script (not a destructive migration) — for every existing `User` row, insert exactly one `UserCapability` row (for CLIENT/PROVIDER) or set `platformRole = 'ADMIN'` (for ADMIN), with no data loss and no ambiguity, because the current model already has exactly one role per user, and that role maps to exactly one target row deterministically.

**Recommended safe sequencing** (expand → migrate → contract, not a single destructive step):

1. **Add** `UserCapability`, `platformRole` column (both nullable/additive), leave `User.role` untouched and still authoritative.
2. **Backfill**: run the deterministic script above against all existing users.
3. **Dual-write period**: registration and any future role/capability-granting code writes to _both_ the old `User.role` and the new tables, while all read paths are migrated one at a time (this is exactly where the §1.3 finding matters — since there are only ~3 choke-point functions plus 2-3 exceptions, "migrate all read paths" is a small, enumerable list, not an open-ended search).
4. **Cutover**: once every backend read path (enumerated fully in §1.3) reads from `UserCapability`/`platformRole` instead of `User.role`, and the frontend's ~18 files are updated to handle capability sets instead of a scalar, stop writing to `User.role`.
5. **Contract** (separate, later, explicitly reviewed step — not part of this migration's initial rollout): drop `User.role` only after a full deploy cycle confirms nothing still reads it. Do not drop it in the same migration that adds the new tables.

This sequencing exists specifically so that **no destructive migration is executed until the dependency analysis is complete and verified in production**, per `module1.md` §26's explicit requirement.

### 2.3 One concrete compatibility concern found: email verification

`User.emailVerifiedAt` (a direct timestamp column) is read today by `AuthService.login` (`user.emailVerifiedAt` null-check) and by `JwtStrategy`-adjacent logic. If `Verification` (type=EMAIL) becomes the source of truth per `module1.md` §14, either:

- (a) keep `User.emailVerifiedAt` as a **denormalized read-optimization** kept in sync by the same write path that creates the `Verification(EMAIL, VERIFIED)` row (smallest change, avoids touching every login-path read), or
- (b) migrate `AuthService.login`'s check to query `Verification` directly (more "correct" per the new architecture, but touches a security-critical hot path — every login — for no functional gain over (a)).

**Recommendation: (a).** This is exactly the kind of "don't rewrite working, tested code without a concrete reason" case CLAUDE.md and the prior Identity audit both flag — `AuthService.login`'s email-verified check is already correct, tested, and sits on the highest-traffic authenticated path in the app. Keep the fast, already-proven column as the read path; make `Verification` the write-side source of truth and system of record for future verification types (PHONE, IDENTITY, etc.) that don't have an equivalent fast-path column.

### 2.4 Backend change inventory (by file, from §1.3-1.4)

| File                                                                                 | Change needed                                                                                                                                                                                | Size                                                                 |
| ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `profiles/profile-access.util.ts`                                                    | `assertProviderRole`/`assertClientRole` signatures change from scalar-equality to capability-set-membership checks                                                                           | Small — 2 functions                                                  |
| `marketplace/services/services.service.ts`                                           | Call-site update only (uses the util)                                                                                                                                                        | Trivial                                                              |
| `jobs/services/jobs.service.ts`                                                      | Call-site update only                                                                                                                                                                        | Trivial                                                              |
| `proposals/services/proposals.service.ts`                                            | Call-site update only                                                                                                                                                                        | Trivial                                                              |
| `proposals/services/connections.service.ts`                                          | Call-site update only                                                                                                                                                                        | Trivial                                                              |
| `direct-contracts/services/direct-contracts.service.ts`                              | Call-site update only (both sides)                                                                                                                                                           | Trivial                                                              |
| `profiles/services/{portfolio,experience,education,certification,skills}.service.ts` | Call-site update only (5 files)                                                                                                                                                              | Trivial each                                                         |
| `referrals/services/referrals.service.ts`                                            | Call-site update only                                                                                                                                                                        | Trivial                                                              |
| `saved-providers/services/saved-providers.service.ts`                                | Two inline checks migrated to shared helper pattern (lines 64, 119)                                                                                                                          | Small                                                                |
| `payments/services/payments.service.ts:187`                                          | **Genuine logic change** — binary ternary becomes a merge-both-views branch when caller holds both capabilities                                                                              | Medium — needs its own design/test pass, not just a signature update |
| `identity/dto/register.dto.ts`                                                       | Decide registration UX: does a new user still pick exactly one initial capability, or can they select both at signup? (Product decision, not inferable from code — flagged as open question) | Depends on product decision                                          |
| `identity/services/auth.service.ts`                                                  | `register()`'s `User.create` call needs `platformRole` default + capability-row creation instead of/alongside `role`                                                                         | Small, inside the existing transaction                               |
| New: capability-activation endpoint(s)                                               | Per `module1.md` §5 ("Become a Provider" flow) — new controller/service work                                                                                                                 | New, not a modification of existing code                             |
| New: admin role-elevation endpoint(s), audited                                       | Per `module1.md` §8                                                                                                                                                                          | New                                                                  |

### 2.5 Frontend change inventory

Per §1.6: `AppContext.tsx`'s `role` field and its ~18 dependent files. This audit does not prescribe the UX (mode-switcher vs. merged views vs. something else — a product decision), but flags that **this is the largest单-piece of work in the whole module**, larger than the backend capability-model change itself, and should be scoped and estimated separately before implementation begins.

---

## 3. Recommended Implementation Order (revised, given this audit's findings)

`module1.md` bundles capability model, RBAC, Google OAuth, verification architecture, and admin provisioning into one module. Based on what this audit found about actual coupling, these do **not** all need to land together:

1. **Platform role column (`USER`/`ADMIN`/`SUPER_ADMIN`) + admin bootstrap mechanism** — smallest, most isolated, and already identified as a blocking gap in the prior Module 1 audit (no way to create an ADMIN account today). Touches only `User`, no capability-model coupling.
2. **`UserCapability` table + backfill + the ~3 choke-point backend changes (§2.4)** — the core identity-model change. Everything in §1.3/§1.4 shows this is a contained, enumerable backend change once the shared `profile-access.util.ts` functions are updated.
3. **`payments.service.ts:187`'s dual-capability view logic** — sequenced explicitly after #2, on its own, because it's the one place in the backend that's a genuine logic change rather than a signature update, and touches the payments module.
4. **Frontend capability-aware `AppContext.tsx` + ~18 dependent files** — the largest single piece of work; should not be started until #2 is stable, since the frontend needs a real capability-bearing backend to build and test against.
5. **`AuthenticationMethod` + Google OAuth** — this audit found **zero coupling** between this and the capability model (Google auth resolves to a `User`, same as password auth does today; nothing about it depends on `UserCapability` existing). Per your own caveat that Google OAuth configuration should remain an implementation/config choice and not block the module, this can be built in parallel with or after #2-4, on its own timeline.
6. **`Verification` table (EMAIL type only)** — per §2.3, this can also be decoupled and built independently once the denormalized-column compatibility approach is agreed.
7. **Permission/RolePermission tables** — explicitly deferred per §2.1, until a concrete admin feature needs fine-grained permissions beyond the three-value platform role.

---

## 4. Open Questions (cannot be answered from the codebase)

1. **Registration UX under the capability model**: does a new user still choose exactly one initial capability at signup (mirroring today's flow, minimizing registration-flow change), or can they select both CLIENT and PROVIDER at once? Affects `register.dto.ts` and the signup form.
2. **Frontend "both capabilities" UX**: mode-switcher (current UI pattern, extended), merged dual-nav, or something else? This determines the actual scope of the ~18-file frontend change in §1.6/§2.5, and is a product decision this audit cannot make.
3. **Admin bootstrap mechanism**: already flagged in the prior Module 1 audit as unresolved — a one-time gated script is the smallest option, but the exact form is an operational decision, not a code-derivable answer.
4. **Whether existing ADMIN accounts should ever be granted capabilities** (i.e., can an admin also act as a client/provider on the marketplace) — the migration mapping in §2.2 assumes no, based on current data shape, but this is worth an explicit product confirmation before the backfill script runs.

---

## 5. Summary

The core finding of this audit is that **the marketplace transaction graph (Jobs → Proposals → Connections → Payments → Reviews → Messages → Disputes) requires zero schema changes** for the capability migration — every one of its 15 FKs already points at a role-agnostic `Profile` row, and role/capability enforcement is concentrated in two shared utility functions plus three identifiable exceptions, not scattered across the codebase. The migration's real size is concentrated in two places this audit explicitly separates: (1) a small, enumerable, low-risk backend change (§2.4), and (2) a large, UX-decision-dependent frontend change (§1.6/§2.5) that should be scoped on its own once the backend capability model is stable. Google OAuth and the Verification-type architecture are both confirmed decoupled from the capability model and can proceed on independent timelines, consistent with your instruction that they should remain implementation choices rather than blocking the module.

No code, schema, or migration files were created or modified in producing this document.
