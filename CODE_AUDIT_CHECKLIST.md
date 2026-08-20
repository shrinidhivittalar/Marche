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

**Status: open — Broken (2/2) and Wrongly wired (5/5) done; Could be better and Should be removed still open.**

---

## Broken

- [x] `apps/web/src/pages/MessagesPage.tsx` (`handleSendMessage`, `thread` resource) — after sending a message, the active thread panel kept showing the pre-send state instead of the just-sent message.
  **Root cause:** `usePolling` (`apps/web/src/hooks/usePolling.ts`) fired a new `refetch()` every tick regardless of whether the previous call was still in flight. `useApiResource`'s generation counter only applies a response if no *newer* call has started since — so once a single request took longer than the 4s poll interval (routine under this dev setup's DB/connection overhead), every subsequent tick started before the prior one resolved, and every response (including the caller's own manual post-send `thread.refetch()`) lost the race and got discarded, forever. Confirmed live: instrumented the fetcher and `load()` and watched `thread.data` never update across 9+ seconds and multiple poll cycles, while the raw GET responses (captured via network listener) already contained the new message every time.
  **Fix:** `usePolling` now tracks in-flight state and skips a tick while the previous call is still pending, so ticks stop overlapping and requests stop backing up.
  **Verified live:** ran `apps/web/e2e/messages.spec.ts` against the isolated e2e stack repeatedly — 0/1 passed before the fix (message-bubble never appeared, confirmed via screenshot), 6/7 after (the one miss consistent with this sandbox's general flakiness, unrelated — Redis/register 500s seen throughout, not a repeat of this failure mode). Extended the existing e2e spec's assertion to check `message-bubble` in the sender's own thread panel, not just the conversation-list preview, so this is now covered going forward. typecheck + lint pending as part of batch verification.
- [x] `apps/api/src/throttler/redis-throttler-storage.ts:69,146-156` — the in-memory fallback (`memoryStore`, used when `REDIS_URL` is unset) is only ever written to, never evicted; every distinct IP/email key ever throttled accumulates a permanent `Map` entry, so a long-running process with no Redis leaks memory unboundedly under normal traffic.
  **Fix:** added a `setInterval` sweep (60s tick, `.unref()`'d so it doesn't keep the process alive) that deletes any entry whose hit-window *and* block have both lapsed; cleared in `onModuleDestroy`. **Verified:** new `apps/api/src/throttler/tests/redis-throttler-storage.spec.ts` with fake timers — confirms a fully-expired entry is swept, a still-blocked entry survives one sweep tick and is swept on the next once its block also lapses, and the interval is cleared on destroy. 3/3 pass; typecheck + lint clean.

## Wrongly wired

- [x] `apps/api/src/proposals/services/proposals.service.ts:114-140` — `withdraw()` uses `getOwnProposal` (no `isDirect` check), so a provider can `POST /proposals/:id/withdraw` on a direct-contract offer, moving it SUBMITTED→WITHDRAWN and firing `proposalWithdrawn` instead of going through `DirectContractsService.decline` (which fires `directContractDeclined`) — the consent flow's supposed sole decision path can be routed around, leaving the client a misleading "provider withdrew" notification for an offer they authored themselves.
  **Fix:** `withdraw()` now fetches the job before writing and throws `ForbiddenException` if `job.isDirect`, pointing the caller at the direct-contracts endpoints instead — same guard shape as `getProposalOnOwnJob`'s existing `isDirect` check on the client side. **Verified:** new test "refuses to withdraw a direct contract offer" in `proposals.service.spec.ts` (142/142 pass in the module); `direct-contracts.service.spec.ts` still 14/14; typecheck + lint clean.
- [x] `apps/web/src/pages/MessagesPage.tsx:112` — `activeConv` defaults to `conversations[0]` on mount/whenever `activeConvId` is unset, so a conversation renders as open (highlighted, thread fetched) without going through `openConversation` — the only place `messagesApi.markRead` is called. Its unread messages stay unread server-side (inflating the unread badge in `Sidebar.tsx`) even though the user is looking at them.
  **Fix:** added an effect that calls `messagesApi.markRead` for the auto-selected first conversation whenever `activeConvId` is unset, mirroring what `openConversation` already does for an explicit click — without duplicating its `setActiveConvId`/`setMobileView` side effects, which aren't needed for the fallback case. Added a `messages-unread-badge` testid to `Sidebar.tsx` (mirroring the existing `notifications-unread-badge` one) to make this provably testable. **Verified live** via a new Playwright e2e spec (`apps/web/e2e/messages.spec.ts`): established a real connection, sent a message as the client, confirmed the provider's unread badge is present before opening Messages and gone after — with zero clicks on the conversation row. Sabotage-checked: reverting the fix reproduces the exact original bug (badge stuck at 1). Along the way found a separate, pre-existing, unrelated bug — see new "Could be better" item below — and rewrote the test's send-confirmation to check the conversation-list preview instead of the active thread panel so it doesn't depend on that other bug.
- [x] `apps/api/src/identity/services/auth.service.ts:146` — `handleUserJoined` runs right after the user row is created but before email verification (`emailVerifiedAt` still null), so anyone can spoof a referral's JOINED status just by registering with an email address they don't own.
  **Fix:** moved the `referralsService.handleUserJoined(...)` call from `register()` to `verifyEmail()`, using the verified user's email returned by `markEmailVerified`. **Verified:** new test "answers a duplicate..." region asserts `register()` no longer calls it; new test "marks the referral joined once the address is actually verified" asserts `verifyEmail()` does, with the right email. 32/32 in `auth.service.spec.ts`, 63/63 across `identity`+`referrals`; typecheck + lint clean. Pure backend logic relocation, no route/contract change — no live browser check needed.
- [x] `apps/api/src/identity/dto/register.dto.ts:9-10` — `email` had no trim/lowercase `@Transform`, unlike `apps/api/src/referrals/dto/create-referral.dto.ts:14` which lowercases the referred email. Since `ReferralsRepository.markJoined` does an exact-string match, a referral for `priya@example.com` never flipped to JOINED if the person registered as `Priya@Example.com`.
  **Fix:** added the same trim+lowercase `@Transform` to `RegisterDto.email`. Also applied it to `LoginDto.email` and `ForgotPasswordDto.email` (`login.dto.ts`, `forgot-password.dto.ts`) — needed together, not scope creep: once registration stores emails lowercased, a user who signed up with a mixed-case address could no longer be found by `findByEmail` at login without the same normalisation there. **Verified:** new `apps/api/src/identity/tests/email-normalisation.dto.spec.ts` (3/3 pass) asserts all three DTOs trim+lowercase; full `identity` suite still 56/56; typecheck + lint clean. Pure DTO-level transform, no route/contract change — no live browser check needed.
- [x] `apps/web/src/pages/provider/ProviderOnboardingPage.tsx:509,566,585,607` — `disabled={profile.loading}` on SkillsCard/ExperienceCard/EducationCard/LanguagesCard only reflected the GET `/profiles/me` fetch state, not the in-flight Add mutation (`runAction` had no "submitting" flag) — the Add button stayed clickable through the whole POST round trip, so refilling the (self-clearing) fields and clicking Add again fired a second, overlapping add before the first resolved.
  **Fix:** added `actionPending` state, set around `runAction`'s try/finally, OR'd into all four cards' `disabled` prop.
  **Verified live:** wrote `apps/web/e2e/onboarding-dup-guard.spec.ts` against the isolated e2e stack — delayed the `/education` POST via route interception, refilled the form with a second entry while the first was in flight, and asserted the button's *immediate* `isDisabled()` state (not `expect().toBeDisabled()`, whose default 10s retry window would falsely pass once the first request's later refetch happened to flip `profile.loading` on its own — confirmed this masks the bug). Sabotage-checked: reverting the fix reproduces the exact finding (button re-enabled once refilled, second `isDisabled()` check fails); restoring it passes, with exactly one POST reaching the network.

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
