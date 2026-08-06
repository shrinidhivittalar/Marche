# Marché — Project Context

This file exists so a fresh AI agent (or engineer) can pick up this project
cold, understand it correctly, and continue work without re-deriving
decisions already made or re-doing work already done. Read this before
touching any code.

---

## 1. What this project is

**Marché** is an Upwork-style marketplace for the event industry. Clients
post event-service requirements (photography, catering, DJ/sound, floral &
decor, venue, event planning, lighting & FX, entertainment); service
providers (vendors/freelancers) browse open jobs and submit proposals;
clients hire, and a contract lifecycle runs through completion.

Three user roles exist: **client** (hires), **vendor/provider**
(freelancer), **admin** (platform operator).

**Critical fact:** this is currently a **static frontend MVP**. There is no
real backend, no real authentication, no real database, and no real
payments. Everything is frontend-only React state, persisted to the
browser's `localStorage`. Signing in doesn't check a password — it pattern-
matches the email to decide a role. This is documented in the repo's own
`README.md` and is not a bug — it's the deliberate current stage of the
project. Do not "discover" this and assume it needs fixing unless asked.

## 2. Tech stack

Monorepo managed with **Turborepo** (`turbo run dev/build/lint` at the
repo root), npm workspaces (`apps/*`, `packages/*`).

- **`apps/web`** — the actual app. Vite + React 19 + TypeScript 6 +
  Tailwind CSS v4 + `radix-ui`. Dev: `npm run dev` (or `npm run dev:web`
  from repo root). Build: `tsc -b && vite build`. Lint: `eslint .`
  (flat config, react-hooks plugin included — it can catch real bugs
  like conditional hooks and hook-order violations, not just style).
- **`packages/ui`** — shared design-system component library (ShadCN-
  style, Tailwind-based): Button, Card, Badge, Calendar, Combobox,
  DatePicker, MonthPicker, PhoneInput, Select, TimePicker, and more.
  Check here before writing a new UI primitive.
- **`packages/config`** — shared ESLint/TypeScript configs.
- No database, no ORM, no server framework, no auth library — none of
  the backend/db sections in `CLAUDE.md` apply yet since there is no
  backend. They become relevant the moment a real backend is added.

## 3. Repo-level engineering standards (`CLAUDE.md`)

The repo has its own `CLAUDE.md` (**"Ellipsonic Engineering SOP" /
"Ponytail" philosophy**) that governs how code should be written here.
Read it in full before making changes — it is the second-highest source
of truth after the existing code itself. Highlights, since they've
governed every decision made so far:

- **YAGNI is mandatory.** Minimum code that solves the stated problem.
  No speculative abstractions, no unrequested flexibility/config, no
  plugin systems / strategy patterns / DI containers / factories /
  event buses unless the repo already needs them.
- **Surgical changes only.** Touch only what the task requires. Don't
  "improve" adjacent code. Don't refactor things that aren't broken.
  Match existing style even if you'd personally do it differently.
  Every changed line should trace directly to the request.
- **Reuse before inventing.** Search the repo for an existing pattern/
  utility before writing a new one.
- **Think before coding.** State assumptions explicitly; if multiple
  interpretations exist, surface them instead of silently picking one.
- **Source-of-truth order:** existing code → `CLAUDE.md` → Ellipsonic SOP
  → Ponytail philosophy → framework docs → general best practice.

## 4. Architecture

```
apps/web/src/
  context/AppContext.tsx   — THE central state file. All jobs/proposals/
                             contracts/notifications/messages/audit logs
                             live here as React state, persisted to
                             localStorage under the `marche_app_state_v8_*`
                             key prefix. Every business-logic action
                             (createJob, submitProposal, hireVendor,
                             vendorMarkCompleted, clientConfirmCompletion,
                             togglePauseJob, deleteJob, adminOverrideBooking
                             State, ...) lives here, not in page components.
  App.tsx                  — route dispatcher. Two module-level lookup
                             tables: EXACT_ROUTES (exact path match) and
                             PREFIX_ROUTES (ordered prefix + trailing id,
                             e.g. /client/jobs/:id). Role-based route
                             gating lives here too (a client/vendor/admin
                             cannot reach another role's routes by typing
                             the URL — with one deliberate exception: admin
                             can reach /provider/dashboard because their
                             own "Jobs" nav link points there).
  pages/client/**           — client-facing pages
  pages/provider/**         — vendor/provider-facing pages
  pages/admin/**            — admin pages
  components/layout/*       — Sidebar, MobileTabBar (desktop/mobile nav)
  components/common/*       — StatusBadge, Modal, EmptyState (shared UI)
  lib/*                     — pure utility functions: formatTime.ts
                             (includes todayISODate), formatBudget.ts,
                             formatFile.ts, availability.ts (vendor
                             calendar slot logic), profileCompleteness.ts
  hooks/*                   — useUnreadCounts, useJobFacets (shared job-
                             feed filtering/faceting logic)
  data/*                    — mockData.ts (all seed data: users, jobs,
                             proposals, contracts, talent profiles, work
                             history, portfolio, testimonials),
                             categoryOptions.ts (canonical CATEGORIES/
                             LOCATIONS constants — always import these,
                             never hardcode a second copy)
  types.ts                  — every TypeScript interface/type. Job,
                             Proposal, Contract, User, TalentProfile,
                             BookingState, EventCategory, etc.
```

### Key data model facts

- **`BookingState`** (shared by `Job.status` and `Contract.bookingState`):
  `Draft | Open | In Progress | Confirmed | Completed | Closed | Cancelled
  | Rejected | Expired | Paused`. A job is only actually biddable when
  `status === 'Open'`. Pausing a job reuses `status: 'Draft'` (plus an
  `isDraftPost` flag distinguishes "never-published draft" from "paused
  after publishing" — this distinction has caused real bugs before,
  see §6).
- **No real backend** means "wired" in this codebase can mean two very
  different things: (a) real logic that persists to localStorage and
  behaves correctly, or (b) a UI that looks complete but is a static
  "Coming Soon" stub with no logic behind it at all (all of
  finances/payments is the latter). Never assume a feature works just
  because the UI looks finished — check whether `AppContext` actually
  has a function backing it.
- **Vendor availability** is tracked separately from bookings, under
  its own localStorage key (`marche_vendor_availability_v1_<vendorId>`),
  as a per-date, per-timeslot (`Morning/Afternoon/Evening/Full Day`)
  status (`open/blocked/booked`). `hireVendor` must check this before
  confirming a contract — this is exactly the kind of cross-cutting
  check that's easy to accidentally weaken during a refactor (it
  happened once this session, see §6).

## 5. Where things stand right now

Two living documents at the repo root track completed and pending work.
**Read both before starting new work** — they are not historical
artifacts, they are the current source of truth for "what's broken" and
"what's missing":

- **`CODE_AUDIT_CHECKLIST.md`** — a full code-correctness audit (bugs,
  wrongly-wired logic, misplaced logic, code-quality issues, dead code).
  **All 64 items are fixed and verified as of the last update** (44 from
  the original audit + 20 from a second fresh audit pass done specifically
  to catch regressions/gaps in the first pass). Every item has a note on
  what was wrong, what the fix was, and how it was verified (type-check +
  lint + live browser testing via Playwright, not just "it compiles").
  If you find a new bug, add it here in the same format rather than
  fixing it silently — this file is the project's audit trail.
- **`FEATURE_GAP_ANALYSIS.md`** — a product-completeness analysis: what a
  real user of an Upwork-style marketplace would expect, what this app
  currently delivers, and researched (cited) comparisons against real
  competitors (Upwork, Fiverr) for what's missing (KYC/identity
  verification, dispute resolution, reputation badges, escrow/real
  payments, 2FA, etc.). This is a **planning document, not a todo list
  that's been executed** — none of its gaps have been built yet as of
  this writing. It exists to inform the next phase of work (see §7).

Both documents were produced using two custom skills (see §8) — reuse
those skills rather than improvising the same process from scratch if
asked to repeat either kind of audit later in the project's life.

## 6. Critical context — things that will bite you if you don't know them

- **The repo had a large amount of uncommitted work sitting in the
  working tree before any of this session's audit work began** (a set
  of mobile-responsive UI components in `packages/ui` and related pages
  — `MobileTabBar.tsx`, `MobileMenuPage.tsx`, several new `packages/ui`
  components). This was pre-existing, unrelated work, not something to
  discard. It got bundled into the first audit commit (`fc28601`)
  because there was no earlier commit boundary to separate it from —
  the commit message says so explicitly. If you ever see a large,
  unexplained diff sitting in the working tree, investigate before
  assuming it's junk — check `git log` and the working tree contents,
  don't just discard it.
- **Self-introduced regressions happen even with careful verification —
  budget for a second pass.** During the fix phase, two small
  regressions were introduced by the fixes themselves (a hook
  extraction that silently dropped a status filter; a mobile nav grid
  that wasn't resized after removing a dead tab). Both were caught by
  a deliberate *second*, fresh audit pass — not by the original
  verification. This is why the audit-and-fix skill (§8) mandates a
  fresh re-audit after the checklist is "done," not just once.
- **A checklist can be wrong even when the code is right.** A real bug
  (`isVendorSlotAvailable` not checking the `'blocked'` status) was
  fixed and verified live in the browser, but got documented as a
  *new* checklist entry instead of checking off the *original* entry
  that described the same bug — leaving one line permanently
  unchecked despite the code being fixed. The user caught this by
  reading the checklist literally and asking "haven't you marked this
  or is it not done?" Always double check that a checkbox status
  matches code reality, especially after moving fast through a long
  batch of items — a `[ ]` in the doc is a claim someone can verify
  against the actual file, so it has to be accurate.
- **A UI button being visible doesn't mean the guard behind it was
  reachable-tested.** The `deleteJob` guard (block deleting a job with
  an active contract) was assumed to protect a hypothetical future
  caller — until live testing showed the client-facing jobs list
  actually renders a clickable "Delete" button on jobs with an active
  contract *today*. Don't assume a defensive check is "just in case" —
  verify whether the dangerous path is already reachable in the current
  UI before deciding how urgent a fix is.
- **`hourlyRate: 0` is a legitimate value, not "unset."** A `||`
  fallback (`currentUser.hourlyRate || baseTalent.hourlyRate`) silently
  overrides an intentionally-zeroed rate. Any nullable/zeroable numeric
  field in this codebase should default to `??`, not `||`, unless you've
  confirmed zero can never be a real, intentional value.

## 7. Suggested next phase (not yet started)

The user's stated intent, as of this writing, is to move from auditing/
fixing into **frontend rework**, informed by `FEATURE_GAP_ANALYSIS.md`.
No design tool integration (Framer specifically) is available in this
environment — Figma (requires OAuth) and Canva integrations exist if
design mockups/assets are needed, but the actual frontend code is
expected to be written directly (React/Tailwind/`packages/ui`), not
generated externally and imported. Confirm scope with the user before
assuming which gaps from the feature-gap doc are in scope for this next
phase — it's a menu of researched gaps, not a committed roadmap.

## 8. Custom skills built during this project

Two reusable skills were created (as user-level Claude Code skills, so
they apply to any project, not just this one) to codify the exact
process used here. If asked to repeat either kind of work later, use
these rather than reinventing the approach:

- **`audit-and-fix`** — full-codebase bug audit → living checklist →
  fix in dependency-aware batches → verify (type-check + lint + live
  browser testing, not just compilation) → checkpoint with a commit →
  repeat. This is the process that produced `CODE_AUDIT_CHECKLIST.md`.
- **`feature-gap-analysis`** — audits product completeness from a real
  user's perspective (not a code-correctness audit): classifies every
  feature as fully-wired / stub-wired / absent, reasons about gaps in
  terms of user trust rather than a flat feature list, backs every
  claimed gap with real researched citations (never asserts competitor
  features from memory), and grows a living markdown doc incrementally
  across a conversation rather than dumping everything at once. This
  is the process that produced `FEATURE_GAP_ANALYSIS.md`.

## 9. Git state as of this writing

- Branch: `UIPhone`
- Not pushed to any remote — everything is local commits only.
- 5 commits total, most recent two being this session's audit work:
  `fc28601` (original 44-item audit fix, bundled with pre-existing
  uncommitted mobile UI work) and `f4ea733` (remaining checklist items
  + fresh second-pass audit fixes).
- Working tree was clean as of the last commit — verify with `git
  status` before assuming that's still true, since time may have
  passed.
