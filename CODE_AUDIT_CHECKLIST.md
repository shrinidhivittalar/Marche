# Code Audit Checklist

Scope: everything landed since the last full audit (`04a168e`, PR #10) — onboarding-answers, the real-invoice/contracts work, and Module 6 (Notifications, backend + frontend + e2e). Four areas audited in parallel; findings consolidated below.

**Summary:** Broken 4 · Wrongly wired 0 · Misplaced 0 · Could be better 14 · Should be removed 0

---

## Broken

- [x] `apps/web/src/components/layout/Sidebar.tsx:68-73,277` — the bell dropdown destructures `useNotifications()` without `loading`/`error`, so `recentNotifs.length === 0` renders "You're all caught up." even while the fetch is still in flight (data defaults to `[]` before it resolves). A user opening the bell right after login is told there's nothing when the real answer is "still loading." NotificationsPage already guards this correctly; Sidebar doesn't.
  **Fix:** destructured `loading`/`error` from `useNotifications()` and added a three-way branch (loading → "Loading…", error → error text, empty → "You're all caught up.") ahead of the existing empty-state check. **Verified live:** intercepted `/notifications` to delay 2s, opened the bell, screenshotted — dropdown shows "Loading…", not the false empty state; intercepted the same endpoint to 500, confirmed the dropdown shows an error message instead of the empty state.
- [x] `apps/web/src/context/AppContext.tsx:354-364` — `markApiNotificationRead`/`markAllApiNotificationsRead` have no try/catch, and both callers (Sidebar, NotificationsPage) invoke them fire-and-forget from `onClick`. A failed PATCH (network blip, expired token) becomes a silent unhandled promise rejection — the notification stays unread with zero user-visible feedback.
  **Fix:** the root cause is at the call sites, not inside the context functions (which correctly still throw so a caller can react) — added `.catch()`/try-catch at every `onClick` in Sidebar (logs to console; no optimistic update ever happened, so the UI just stays accurate) and in NotificationsPage (sets a new `actionError` state rendered as a visible error card, since that's the primary surface for managing notifications). **Verified live:** intercepted `read-all` and the per-id `read` endpoint to 500, clicked, confirmed a visible error message on the page and zero `pageerror` events in either case (previously an unhandled rejection).
- [x] `apps/web/src/pages/NotificationsPage.tsx:66-76` — "Mark All as Read" is gated only on `notifications.length > 0`, not on `activeTab === 'activity'`. A vendor on the "Job Alerts" tab (unrelated mock settings) still sees and can click this button, silently marking real API notifications as read for content that isn't even on screen.
  **Fix:** added `activeTab === 'activity' &&` to the button's render condition. **Verified live:** signed in as a provider with 2 real unread notifications, confirmed the button is visible on Activity, disappears on Job Alerts, reappears back on Activity — screenshotted the Job Alerts state to confirm the sidebar badge still correctly shows "2" (the notifications themselves are untouched) while the button is gone.
- [x] `apps/web/src/index.css:86-121` + `packages/ui/src/components/Dialog.tsx:55-63` — the invoice print-isolation CSS overrides `dialog-overlay`/`dialog-content`/`dialog-body` but never `DialogHeader` (title + description, a sibling of `DialogBody`). It only gets `visibility: hidden` from the generic `body *` rule, which hides content but doesn't collapse the box — printing the invoice leaves a blank gap the height of the modal header, the same bug class the commit's own message says it fixed for the overlay.
  **Fix:** added `[data-slot='dialog-content']:has(.print-area) [data-slot='dialog-header'] { display: none; }` to the print media block in `apps/web/src/index.css` — scoped the same way the existing overlay/content/body rules are, so only a dialog actually printing something is affected. **Verified live:** rendered the real `Modal`-shaped DOM structure (`dialog-content` > `dialog-header` + `dialog-body > .print-area`), loaded `index.css`, emulated print media, and read the computed `display` of `dialog-header` via Playwright — confirmed `none`; screenshotted the print render to confirm the invoice content starts at the top with no gap.

## Wrongly wired

(none found)

## Misplaced

(none found)

## Could be better

**Notifications backend**
- [~] `apps/api/src/notifications/services/notifications.service.ts:127-141` — `markAsRead` does `findById` → `markRead` → `findById` again; two extra round trips per call, unavoidable given `updateMany` doesn't return rows. **Skipped by user decision** — audit itself judged this not worth the diff.
- [~] `apps/api/src/proposals/services/proposals.service.ts:196-206` — in `accept()`, `proposalAccepted` and `connectionEstablished` are awaited sequentially rather than via `Promise.all`; both write to independent recipients and could run concurrently. **Skipped by user decision** — negligible impact, audit itself flagged it as marginal.
- [x] `apps/api/src/jobs/tests/jobs.service.spec.ts` (the `cancel` describe block) — `notificationsService.jobCancelled` is wired into the test harness but never asserted as called. module6.md's "Job cancellation notifies relevant proposers" test case is uncovered at this layer.
  **Fix:** added two tests — `jobCancelled` is called with the cancelled job's id on success, and not called at all when the cancel transition itself fails. **Verified:** `npx jest jobs.service.spec.ts` — 44/44 pass.
- [x] `apps/api/src/proposals/tests/proposals.service.spec.ts` — `notificationsService` is injected into every test but no `submit`/`withdraw`/`accept`/`reject` test asserts it was called, with what recipient, or what `data`. A regression that silently drops a notification call, or swaps client/provider recipients, would pass every existing test here. **Most significant finding in this batch.**
  **Fix:** added recipient-and-data assertions to `submit` (client, not the submitting provider), `withdraw` (client, not the withdrawing provider), `accept` (provider gets `proposalAccepted`; both parties get `connectionEstablished`, client first), and `reject` (provider, not the deciding client) — plus a "does not notify anyone if the write fails" case for `submit` and `accept`. **Verified two ways:** 92/92 pass across both files; additionally sabotaged `submit()`'s recipient (`job.clientProfileId` → `profile.id`, the exact bug class the audit warned about) and confirmed the new test fails with a clear expected-vs-received diff, then reverted the sabotage and re-confirmed green.

**Onboarding-answers**
- [ ] `apps/api/src/profiles/dto/update-profile.dto.ts:158` — `website` is validated with only `@IsString @MaxLength(300)`, no URL-format check, even though this same file already has a URL-shape validator for `socialLinks` and `portfolio.dto.ts` uses `@IsUrl`. The UI placeholder implies a URL; a user can currently save `"asdf"`.
- [ ] `apps/api/src/profiles/dto/update-profile.dto.ts:132` — comment says "see profiles.repository.ts for why these exist" but no matching comment exists there — stale pointer.
- [ ] No test coverage added in `apps/api/src/profiles/tests/` for the five new DTO fields (enum validation, array cap, maxLength, optionality).

**Notifications frontend**
- [ ] `apps/web/src/components/layout/Sidebar.tsx:286-336` vs `apps/web/src/pages/NotificationsPage.tsx:227-276` — near-identical notification card rendering (icon/color-by-category switch, title/message/time layout, unread styling) duplicated between the two. Worth extracting a shared component.
- [ ] `apps/web/src/context/AppContext.tsx:343-346` — `notificationsApi.list(accessToken, 1, 50)` hardcodes page 1/limit 50 and discards `hasNext`/`totalPages` from the envelope. A user with 50+ notifications has no way to see older ones — no "load more" UI.
- [ ] `apps/web/src/lib/formatNotification.ts:71-75` — `formatNotificationTime` always renders `hour:minute` only, no date. A notification from last week and one from five minutes ago both show e.g. "14:32."
- [ ] `apps/web/e2e/notifications.spec.ts` — no test exercises the dropdown's loading/error state, a notification with malformed/missing `data` (the `route === null` branch), or the Job Alerts tab interaction with real notifications present (would have caught the Broken #3 finding above).

**Real invoice / contracts**
- [ ] `apps/web/src/pages/client/ContractDetailPage.tsx:892` — `₹0` "Marché fee" is a bare hardcoded literal representing the platform's stated 0% commission, but that reasoning isn't captured in the code (no constant, no comment) — reads as a stub to a future reader.
- [ ] `apps/web/src/index.css:1-70` — this commit's diff reformats unrelated pre-existing CSS (quote style, multi-line `box-shadow`) with nothing to do with the print/invoice feature — scope creep, harmless but against this repo's own "don't improve adjacent code" convention.
- [ ] `apps/web/src/pages/client/ContractDetailPage.tsx:42` — state variable still named `acknowledgementOpen`/`setAcknowledgementOpen` even though the user-facing concept was renamed "Booking Acknowledgement" → "Invoice" throughout this diff. Cosmetic naming drift only.

## Should be removed

(none found)
