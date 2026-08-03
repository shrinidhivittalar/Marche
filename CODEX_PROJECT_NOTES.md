# Codex Project Notes — Marché

**Maintained by: Codex**

## Project understanding

Marché is a static, frontend-only MVP for an event-services marketplace. It uses a job → proposal → contract lifecycle for client, vendor, and admin roles. Application data is React state persisted to browser `localStorage`; there is no backend, real authentication, database, payment provider, or real escrow implementation yet.

The PRD remains the product reference, but the existing code and `context.md` are the authoritative description of the current implementation. Finance and payment screens are intentional Coming Soon previews unless `AppContext` provides real backing behavior.

## Implementation conventions Codex will follow

- Existing code is the primary source of truth, followed by `CLAUDE.md` and its Ellipsonic/Ponytail SOP.
- Keep changes surgical: every changed line must serve the requested outcome; do not refactor unrelated code.
- Search and reuse before creating: check `packages/ui`, shared utilities, hooks, canonical data constants, and comparable pages first.
- Keep marketplace state changes and business rules in `apps/web/src/context/AppContext.tsx`; pages own UI and local form state.
- Preserve role-aware routing in `App.tsx`, the job/proposal/contract lifecycle guards, audit logging, and vendor availability conflict checks.
- Use the shared `@marche/ui` components and design tokens for UI work. Match the repository's React, TypeScript, and Tailwind style rather than introducing a new pattern.
- Use the canonical `CATEGORIES` and `LOCATIONS` data and existing helpers such as budget, availability, time-formatting, profile-completeness, and job-facet utilities.
- Treat the frontend-only/localStorage architecture as intentional unless a request explicitly includes backend, authentication, database, or payment work.
- When a new defect is found, add it to `CODE_AUDIT_CHECKLIST.md` in its established format rather than silently fixing it.
- Verify changes in proportion to risk: type-checking, linting, and live-flow/browser testing for meaningful behavior changes.

## Baseline validation note (2026-08-03)

`npm run lint` currently fails on the existing synchronous `setBidAmount` call inside a `useEffect` in `apps/web/src/pages/provider/SubmitProposalPage.tsx`; it also reports five warnings. `npm run build` completed TypeScript compilation but Vite/esbuild then failed with `spawn EPERM`, which appears environment-related.

## Feature gap priority note (2026-08-03)

Most remaining high-value gaps now depend on backend work. Backend/accounts, real payments/escrow, real KYC compliance, real mediation/arbitration, production badge telemetry, automatic time tracking/proof capture, enforceable legal agreements, marketplace health analytics, 2FA, data export/deletion, fraud moderation, and real email/push notification delivery all need server-side records, authentication, permissions, durable storage, or external providers to be meaningful.

Frontend-only work can still be useful for MVP polish, but it should be treated as preview/intake UI unless backend support is planned. Reasonable frontend-only candidates include help center/support contact, search ranking tweaks, categories/taxonomy depth, freelancer analytics previews, pre-hire video scheduling UI, multi-currency/localization UI, and background/credential-check intake.

Current recommendation: start backend/accounts next if the goal is to move beyond localStorage previews. Otherwise, expect additional feature-gap work to be mostly UI scaffolding rather than real marketplace infrastructure.