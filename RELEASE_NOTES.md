# Release Notes

Short summary of what's shipped, newest first. For implementation detail,
see git history — this is the "what changed and why it matters" version.

## 2026-09-07 — Provider Contracts and Stats unlocked

- Provider Contracts tab (locked since 2026-08-24) is now live — it was
  already reading real connection/payment/work-diary data, just hidden
  behind the "Coming Soon" preview.
- Provider Stats page unlocked too, but first rewired off leftover mock
  data onto real endpoints: win rate and proposal funnel from real
  proposals, earnings (total, by month, by category) from real payments,
  and client rating from real reviews.
- Five security-audit findings closed out: per-user throttling on
  referrals and AI routes, a production clamp on the auth rate-limit
  override, an upgraded `nodemailer`, and forced-download signed URLs for
  PDFs.
- Fixed the test database silently drifting from production — migrations
  had been applying to production's direct connection instead for months.
  Running them for real surfaced and fixed a genuine ordering bug in job
  category updates.

## 2026-08-24 — Post-redesign bug fixes

- Provider now gets a real notification the moment a client's payment goes
  through, instead of having to check Finances manually.
- Fixed the Pay Now button and provider invoice list randomly
  flickering/disappearing — a polling bug, not a payment bug.
- Clients can now edit a requirement after publishing it (was only possible
  for drafts before).
- Recovered a fix that had been left out of the previous merge: back button
  after logout no longer shows a stale "still logged in" page.
- Provider dashboard: static "Welcome back" greeting, dark mode's leftover
  green brand color corrected to red, Contracts tab locked again (not a real
  feature yet).

## 2026-08-21/23 — Red/cream brand redesign

- Landing page, all four auth screens, and the client dashboard redesigned
  to the red/cream brand — new typography, particle-field hero, real
  category data instead of fabricated stats.
- Fixed browser back/forward after logout briefly showing a stale
  logged-in page (bfcache).

## 2026-08-20 — Full audit closed out

- 19 findings fixed across the app: a Redis connection leak, a Direct
  Contracts consent bypass, a message-staleness bug, a payment/webhook
  race condition, and 15 smaller correctness and polish issues.
- Full manual walkthrough of every client and provider screen — nothing
  broken, both real end-to-end flows (client hires provider; provider
  creates a service) confirmed working.

## 2026-08-18/19 — Core marketplace went real

- Real Razorpay payments (test mode), triggered at hire time.
- Messaging, Work Diary, two-way blind reviews, disputes, direct contracts,
  saved talent, referrals, job alerts, admin audit dashboard — all wired to
  real endpoints, no more mock data.
- Connection lifecycle: ACTIVE → COMPLETED, either by client confirmation
  after the event date or automatically a few days later.
- A negative-testing security pass: rate limiting, JWT tampering, IDOR all
  checked and passing.

## 2026-08-17 and earlier — Foundation

- Identity, profiles, marketplace, media, jobs, and proposals modules built
  against a real Postgres schema.
- The core transaction — post a requirement, get a proposal, accept it —
  working end to end for the first time.

---

**Known gaps, not yet built:** Redis is confirmed provisioned in production
(Render), but local dev/e2e still fall back to in-memory throttling —
unconfirmed whether that's provisioned there too.
