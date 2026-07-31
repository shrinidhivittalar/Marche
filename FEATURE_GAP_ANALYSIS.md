# Marché — Feature Gap Analysis

_Compiled from a codebase audit + comparison against Upwork/Fiverr/Freelancer.com industry standards. Last updated: 2026-07-31._

## 1. What currently works (real, wired to `AppContext` + localStorage)

- **Job posting** — create, draft, edit, pause, delete, file attachments (base64, frontend-only)
- **Search/discovery** — real client-side filtering & sorting for both talent search and job search
- **Proposals/bidding** — submit, draft, accept/decline, hire triggers contract creation, fixed & range budgets
- **Messaging** — real send/read, persisted per contract (only unlocked after hiring, no pre-hire chat)
- **Contracts** — full lifecycle: hire → vendor marks complete → client confirms → closed, with vendor availability auto-blocking
- **Notifications** — real, with unread badges
- **Dashboards** — computed from live jobs/proposals/contracts data
- **Admin panel** — real audit log filtering + override actions

## 2. Weakest spots found in the codebase

| Area | Status |
|---|---|
| Payments/finances | Fake — all "Coming Soon" screens over blurred static UI, no escrow, no real transactions |
| Backend/accounts | None — everything lives in browser localStorage; no server, no real login/password |
| Reviews/ratings | Not wired — fields exist in data model but nothing creates or displays them after a contract closes |
| Settings | Static markup — checkboxes have `defaultChecked` but no `onChange`, nothing persists |
| Public profiles | Show canned mock data instead of the logged-in user's own edited profile info |
| Saved talent | UI exists, but no save action wired up in `AppContext` — clicking it does nothing |
| "Refer" flow | Stub `ComingSoonPage` |

## 3. Why fake money & no backend are the most damaging gaps

- **No real payments/escrow** → nobody can trust that money is actually held or paid out. This is the single biggest trust signal on any marketplace (it's why escrow was invented in the first place).
- **No backend / no real accounts** → all data lives in one browser's localStorage. Clear your cache or switch devices and your entire history (jobs, contracts, chats) disappears. Two "real" users aren't actually talking through a shared server — it's a single-player simulation of a two-sided marketplace.
- **No reviews/ratings** → a great freelancer and a terrible one look identical after a job. There is no reputation loop, so there's no reason to keep choosing (or returning to) this platform over any other.

Together these three answer "no" to the three questions every user asks before trusting a marketplace: *Can I trust the other person? Can I trust the platform with my money? Will my data even still be here tomorrow?*

## 4. Additional gaps found via industry research (beyond money/backend)

Benchmarked against Upwork, Fiverr, Freelancer.com, and a 21-point services-marketplace feature checklist.

1. **Identity verification (KYC)** — Upwork legally requires ID + proof-of-address verification (U.S. Patriot Act / KYC compliance) before freelancers can withdraw funds or submit proposals. Marché's "login" is just an email-pattern match with no real identity behind either role.
2. **Dispute resolution** — Standard flow: raise a dispute → submit evidence → platform mediates → escalate to arbitration if unresolved. Marché has no dispute path at all once a contract is closed.
3. **Reputation badges** (e.g. "Top Rated," "Rising Talent," "Verified Professional") — earned from completion rate, ratings, and responsiveness; makes good freelancers visible in search. Not implemented — rating fields exist but nothing computes them.
4. **Time tracking / proof of work** — Upwork's desktop app takes periodic screenshots/activity logs for hourly contracts as proof of hours billed. Marché has a "range" budget mode but no way to verify actual hours worked.
5. **Legal agreements / ToS acceptance** — Real platforms have a click-accept Terms of Service and often a standardized contract/NDA template per job, timestamped for legal protection. Marché has no ToS flow and no actual contract document — a "Contract" is just a status field.
6. **Background/credential checks** — Deeper vetting (licenses, certifications) for certain job categories. Lower priority for an MVP, but standard once real money is involved.
7. **Saved talent / job alerts** — Broken/missing as noted above; standard on every competitor.
8. **Marketplace health analytics** — Admin has audit logs, but no dashboard tracking overall marketplace health (active users, job fill rate, dispute rate, satisfaction).
9. **Mobile access** — Web-only currently; all major competitors have mobile apps since users check messages/alerts on the go.

## 5. Clarification: "UI mockup" vs. "wired but pointed at the wrong place"

It's easy to assume the whole app is just a UI mockup because money and backend are missing — that's not quite accurate, and the distinction matters for what work is actually left.

- **Only the money pages are pure UI mockup.** Finances, budgets, transactions — blurred placeholder screens with "Coming Soon" text and zero logic behind them.
- **Everything else is already wired, just wired to the wrong place.** Job posting, search, proposals, hiring, contracts, messaging, notifications — all of this runs on real working functions (`createJob`, `hireVendor`, `sendMessage`, etc. in `AppContext`) that create and persist real data. It is genuinely functional, not fake buttons.
- The catch: all of that wiring currently plugs into the **browser's localStorage** instead of a real server/database. It works, but only in one browser, with no real second user on the other end, and nothing survives clearing the cache or switching devices.

**Bottom line:** the core marketplace logic is already built — it just needs to be *re-pointed* (swap localStorage calls in `AppContext` for real API calls to a server, add a database, add real accounts) rather than built from scratch. **Money is the one part that genuinely needs to be built from zero**, since no payment logic exists today.

## 6. Minor / lower-priority gaps

Secondary to the big three (backend, money, reviews/disputes/KYC), but worth tracking:

- **Onboarding verification loop** — no email/phone verification step at signup, so account creation has zero friction or validation (compounds the KYC gap in section 4).
- **Search ranking/algorithm** — current search is filter+sort only; real platforms weight results by past performance, responsiveness, and relevance, not just literal filter matches.
- **Notification preferences** — notifications fire correctly, but there's no way to control channel or frequency (email vs. in-app, instant vs. digest) — tied to the broken Settings page in section 2.
- **Freelancer-side analytics** — no profile views, proposal response rate, or invite rate shown to freelancers; standard on Upwork/Fiverr to help them improve, currently absent here.
- **Categories/taxonomy depth** — worth auditing whether job categories are a flat list or have subcategories/skill tagging, since that directly affects how well search/matching can ever work.

## 7. Additional niche gaps (security, privacy, support)

- **Two-factor authentication / account security** — no 2FA anywhere; standard on any platform handling money and personal data.
- **Data privacy / export & deletion (GDPR-style)** — no way for a user to download or delete their own data; increasingly a legal requirement, not just a nice-to-have.
- **Fraud/spam detection & content moderation** — no filtering for fake job posts, scam proposals, or inappropriate messages. Every real marketplace has some layer of this, even basic keyword flagging.
- **Help center / support contact** — no FAQ, support ticket, or contact-support flow anywhere in the app; users hit a wall if something breaks.
- **Multi-currency / localization** — everything appears to be single-currency, single-language; fine for MVP, but a real limitation if targeting more than one region.
- **Pre-hire video call / interview scheduling** — Upwork lets clients schedule a call before hiring; Marché only allows messaging after a hire, so there's no way to "interview" someone first.

## 8. Sources

- [Know Your Customer (KYC) identity information – Upwork Help](https://support.upwork.com/hc/en-us/articles/211067818-Know-Your-Customer-KYC-identity-information)
- [Types of ID Verification – Upwork Help](https://support.upwork.com/hc/en-us/articles/360001176427-Types-of-ID-Verification)
- [Know Your Contractor: How IDV Builds Trust in Freelance Marketplaces](https://regulaforensics.com/blog/freelancer-id-verification/)
- [Checklist of 21 Services Marketplace Features You Need in 2026 — Rigby](https://www.rigbyjs.com/blog/services-marketplace-features)
- [Marketplace Trust Features in 2026: The Must-Haves](https://www.valtorian.com/blog/marketplace-trust-2026)
- [Fiverr vs. Upwork: Which Is Best For Business in 2026?](https://www.fiverr.com/resources/guides/business/fiverr-vs-upwork)
- [Upwork vs Fiverr: Which One is Better For You? — Wise](https://wise.com/us/blog/upwork-vs-fiverr-review)
