# Code Audit Checklist

Scope: everything landed since the last full audit closed (`19dd61b`) — 67
commits covering Messaging, Reviews, Disputes, Connection completion, Saved
Talent, Referrals, Job Alerts, Availability Calendar, Admin audit dashboard,
mobile polish, real Razorpay Payments, Contracts workspace unblur, Direct
Contracts (including the same-day consent-gap fix), Work Diary, the
onboarding rewrite, the post-logout back-button auth guard, and the Redis
throttler fallback. Five areas audited in parallel; findings consolidated
below.

*(The previous audit's checklist, covering onboarding-answers/real-invoice/
Module 6 Notifications, closed with everything fixed — see git history at
`19dd61b` if you need it; this file replaces it rather than appending.)*

**Summary:** Broken 2 (1 discovered mid-audit, see below) · Wrongly wired 5 · Misplaced 0 · Could be better 11 · Should be removed 2

**Status: open.**

---

## Broken

- [ ] `apps/web/src/pages/MessagesPage.tsx` (`handleSendMessage`, `thread` resource) — **newly found while fixing the item below, not yet fixed.** After sending a message, the conversation-list preview updates correctly (via `previews.refetch()`) but the active thread panel itself keeps showing the pre-send state ("No messages yet…" if it was empty) instead of the just-sent message — live-reproduced twice, confirmed unrelated to the auto-open fix (identical failure with that fix disabled). `thread.refetch()` is called and awaited right after `messagesApi.send()` resolves, so the bug is somewhere in why that refetch's result isn't reaching the render — not yet root-caused. Flagging per this skill's rule on out-of-scope discoveries rather than fixing inline.
- [x] `apps/api/src/throttler/redis-throttler-storage.ts:69,146-156` — the in-memory fallback (`memoryStore`, used when `REDIS_URL` is unset) is only ever written to, never evicted; every distinct IP/email key ever throttled accumulates a permanent `Map` entry, so a long-running process with no Redis leaks memory unboundedly under normal traffic.
  **Fix:** added a `setInterval` sweep (60s tick, `.unref()`'d so it doesn't keep the process alive) that deletes any entry whose hit-window *and* block have both lapsed; cleared in `onModuleDestroy`. **Verified:** new `apps/api/src/throttler/tests/redis-throttler-storage.spec.ts` with fake timers — confirms a fully-expired entry is swept, a still-blocked entry survives one sweep tick and is swept on the next once its block also lapses, and the interval is cleared on destroy. 3/3 pass; typecheck + lint clean.

## Wrongly wired

- [x] `apps/api/src/proposals/services/proposals.service.ts:114-140` — `withdraw()` uses `getOwnProposal` (no `isDirect` check), so a provider can `POST /proposals/:id/withdraw` on a direct-contract offer, moving it SUBMITTED→WITHDRAWN and firing `proposalWithdrawn` instead of going through `DirectContractsService.decline` (which fires `directContractDeclined`) — the consent flow's supposed sole decision path can be routed around, leaving the client a misleading "provider withdrew" notification for an offer they authored themselves.
  **Fix:** `withdraw()` now fetches the job before writing and throws `ForbiddenException` if `job.isDirect`, pointing the caller at the direct-contracts endpoints instead — same guard shape as `getProposalOnOwnJob`'s existing `isDirect` check on the client side. **Verified:** new test "refuses to withdraw a direct contract offer" in `proposals.service.spec.ts` (142/142 pass in the module); `direct-contracts.service.spec.ts` still 14/14; typecheck + lint clean.
- [x] `apps/web/src/pages/MessagesPage.tsx:112` — `activeConv` defaults to `conversations[0]` on mount/whenever `activeConvId` is unset, so a conversation renders as open (highlighted, thread fetched) without going through `openConversation` — the only place `messagesApi.markRead` is called. Its unread messages stay unread server-side (inflating the unread badge in `Sidebar.tsx`) even though the user is looking at them.
  **Fix:** added an effect that calls `messagesApi.markRead` for the auto-selected first conversation whenever `activeConvId` is unset, mirroring what `openConversation` already does for an explicit click — without duplicating its `setActiveConvId`/`setMobileView` side effects, which aren't needed for the fallback case. Added a `messages-unread-badge` testid to `Sidebar.tsx` (mirroring the existing `notifications-unread-badge` one) to make this provably testable. **Verified live** via a new Playwright e2e spec (`apps/web/e2e/messages.spec.ts`): established a real connection, sent a message as the client, confirmed the provider's unread badge is present before opening Messages and gone after — with zero clicks on the conversation row. Sabotage-checked: reverting the fix reproduces the exact original bug (badge stuck at 1). Along the way found a separate, pre-existing, unrelated bug — see new "Could be better" item below — and rewrote the test's send-confirmation to check the conversation-list preview instead of the active thread panel so it doesn't depend on that other bug.
- [x] `apps/api/src/identity/services/auth.service.ts:146` — `handleUserJoined` runs right after the user row is created but before email verification (`emailVerifiedAt` still null), so anyone can spoof a referral's JOINED status just by registering with an email address they don't own.
  **Fix:** moved the `referralsService.handleUserJoined(...)` call from `register()` to `verifyEmail()`, using the verified user's email returned by `markEmailVerified`. **Verified:** new test "answers a duplicate..." region asserts `register()` no longer calls it; new test "marks the referral joined once the address is actually verified" asserts `verifyEmail()` does, with the right email. 32/32 in `auth.service.spec.ts`, 63/63 across `identity`+`referrals`; typecheck + lint clean. Pure backend logic relocation, no route/contract change — no live browser check needed.
- [ ] `apps/api/src/identity/dto/register.dto.ts:9-10` — `email` has no trim/lowercase `@Transform`, unlike `apps/api/src/referrals/dto/create-referral.dto.ts:14` which lowercases the referred email. Since `ReferralsRepository.markJoined` does an exact-string match, a referral for `priya@example.com` never flips to JOINED if the person registers as `Priya@Example.com`.
- [ ] `apps/web/src/pages/provider/ProviderOnboardingPage.tsx:509,566,585,607` — `disabled={profile.loading}` on SkillsCard/ExperienceCard/EducationCard/LanguagesCard only reflects the GET `/profiles/me` fetch state, not the in-flight Add mutation (`runAction` has no "submitting" flag) — the Add button stays clickable through the whole POST round trip, so a fast double-click can fire duplicate add requests.

## Misplaced

(none found)

## Could be better

**Payments**
- [ ] `apps/api/src/payments/services/payments.service.ts:113-125` — `verifyCallback` and `handleWebhookEvent` both read the payment row, check `status !== 'PAID'`, then call `markPaid` with no locking/transaction; if both fire concurrently, the browser-verified real signature can be overwritten by the webhook's empty-string signature (`markPaid(payment.id, paymentId, '')`), silently blanking the audit trail even though final status is correct.
- [ ] `apps/web/src/pages/client/finances/TransactionsPage.tsx:18` and `WeeklySummaryPage.tsx:22` — call `paymentsApi.mine(token as string)` with no `limit` (defaults to 50), no pagination controls in either page — a client with 50+ payments silently sees an incomplete list/total with no truncation indicator.
- [ ] `apps/web/src/pages/client/finances/BudgetsPage.tsx:15,18` and `apps/web/src/pages/provider/FinancesPage.tsx:22` — `jobsApi.mine`/`paymentsApi.mine` capped at `limit: 100`, no pagination — planned/committed/earned totals silently understate past 100 jobs/payments.
- [ ] `apps/web/src/lib/finance.ts:11-14` — `formatMoney`'s `toLocaleString('en-IN')` has no explicit `minimumFractionDigits`/`maximumFractionDigits` — "9500.50" renders as "9,500.5" instead of a consistent two-decimal format.

**Direct Contracts / Work Diary**
- [ ] `apps/web/src/pages/provider/MyWorkPage.tsx:262` — renders `proposal.coverMessage` unconditionally even though direct offers hardcode `'Direct contract, offered outside the marketplace.'` (`direct-contracts.service.ts:97`) — a direct-contract row looks like an ordinary proposal (no `isDirect` badge) until opened, unlike `ProposalDetailProviderView.tsx` which does branch on it.
- [ ] `apps/web/src/lib/direct-contracts-api.ts:22-26` — `directContractsApi.create` is typed to return `{ id: string }`, but the controller returns the full `Proposal` row — narrower type just hides the rest of the payload from callers, not a runtime bug, but an inaccurate contract.

**Messaging / Completion**
- [ ] `apps/api/src/proposals/repositories/connections.repository.ts:116-136` — `markCompleted`'s comment claims "both call this rather than each writing the row independently," but `sweepAutoComplete` never calls `markCompleted` — it duplicates the same write inline via `updateMany`, so the comment is inaccurate and the two paths can drift.
- [ ] `apps/api/src/proposals/services/connections.service.ts:96-122` — `confirmComplete` doesn't call `sweepAutoComplete` first (unlike `findById`/`listMine`), and does a check-then-write with no transaction/version guard — a concurrent sweep and a manual confirm can both fire, re-stamping `completedAt` to a later timestamp than actual completion.
- [ ] `apps/web/src/pages/client/ContractDetailPage.tsx:58-71` — unlike the payment card (`usePolling` at line 83), the connection resource itself is never polled — if `sweepAutoComplete` flips ACTIVE→COMPLETED while this page is open, the status badge/review form/confirm button stay stale until navigating away and back.

**Mobile polish / onboarding**
- [ ] `apps/web/src/pages/MessagesPage.tsx:178-180` — full-page load state still renders plain `"Loading messages…"` text; the sibling skeleton-loading pass (`c08c4ad`) converted every other whole-page loader to the shared `Skeleton` primitive but left this one out.
- [ ] `apps/web/src/pages/provider/ProviderHomePage.tsx:169` — greeting hardcoded to `"Good Morning"` regardless of actual time of day.

## Should be removed

- [ ] `apps/web/src/lib/availability.ts:1-63` — entire file is dead, localStorage-based mock availability calendar; the real one is served by `ConnectionsService.myCalendar` and rendered in `apps/web/src/pages/provider/MyWorkPage.tsx:88-93`.
- [ ] `apps/web/src/context/AppContext.tsx:1065-1136` — `hireVendor` (and its calls into the dead `lib/availability.ts` helpers at lines 1073-1074, 1125) is unreachable; no live page calls it, only referenced in a comment at `apps/web/src/pages/client/ClientDashboard.tsx:111`.
