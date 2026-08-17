# Marché — Feature Gap Analysis

A product-completeness audit, not a code-correctness one: does the app do what
a real user of an event-services marketplace expects, and where it doesn't,
how much does that actually cost?

Written against `main` at commit `eab8117` (2026-08-17). Findings carry
`file:line` evidence so they can be re-checked rather than taken on trust.

---

## 1. What genuinely works

The core marketplace transaction is real, end to end, with no mocks in the
path — this is the part that is done:

```
client posts a requirement → provider browses and proposes →
client accepts → requirement FILLED, competing proposals declined,
connection established → both parties notified
```

Backed by real API modules and Postgres rows, and covered by 85 Playwright
tests that drive a browser against the real API:

| Area                                                                                  | Where it lives               |
| ------------------------------------------------------------------------------------- | ---------------------------- |
| Registration, email verification, login, rotating refresh tokens                      | `apps/api/src/identity`      |
| Provider profiles: skills, experience, education, languages, visibility, public pages | `apps/api/src/profiles`      |
| Service listings, search, filters, provider discovery                                 | `apps/api/src/marketplace`   |
| Requirements and their lifecycle                                                      | `apps/api/src/jobs`          |
| Proposals: submit, withdraw, accept, decline, and the connection an accept opens      | `apps/api/src/proposals`     |
| In-app notifications for proposal and job events                                      | `apps/api/src/notifications` |
| Uploads for avatars, portfolios, service images, attachments                          | `apps/api/src/media`         |

That is a genuine achievement and worth naming plainly: discovery through
acceptance is not a demo.

## 2. Where it stops being real

**Everything after "hire" is a simulation.** There is no `contracts`,
`messages`, `reviews`, `disputes`, `work-diary`, `payments`, `invoices` or
`escrow` module anywhere in `apps/api/src`. Those features exist only as
arrays in the browser.

The important nuance — and the reason this is easy to miss: these screens are
**not** dead buttons. They have working logic, and their writes **survive a
page reload**, because `AppContext` persists its mock arrays to
`localStorage` under `marche_app_state_v8`
(`apps/web/src/context/AppContext.tsx:216`, written at ~437–528). So the app
behaves convincingly right up until the moment a second person, a second
device, or a cleared cache is involved.

| Feature                                                | State                                              | Evidence                                                                                             |
| ------------------------------------------------------ | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Contracts / hiring                                     | Mock array, localStorage                           | `AppContext.tsx:178` (`hireVendor`), read by `pages/provider/ContractsPage.tsx:11`                   |
| Contract lifecycle (mark complete, confirm)            | Mock array                                         | `AppContext.tsx:180-181`                                                                             |
| Messaging / chat                                       | Mock array                                         | `pages/MessagesPage.tsx:115` → `AppContext.tsx:120`; no `messages` API client in `apps/web/src/lib/` |
| Reviews / ratings                                      | Mock array                                         | `AppContext.tsx:182` (`submitReview`)                                                                |
| Disputes                                               | Mock array                                         | `AppContext.tsx:183` (`raiseDispute`)                                                                |
| Work diaries                                           | Mock array, plus a "Coming soon" route             | `AppContext.tsx:184-190`; `App.tsx:105`                                                              |
| Client finances: weekly summary, transactions, budgets | Derived from mock contracts                        | `pages/client/finances/TransactionsPage.tsx:11`                                                      |
| Provider finances / earnings                           | Derived from mock contracts                        | `pages/provider/FinancesPage.tsx:11`                                                                 |
| Saved talent, referrals, job alerts                    | Mock arrays                                        | `AppContext.tsx:123,128`; `NotificationsPage.tsx:10-13`                                              |
| Admin audit dashboard                                  | Mock array, despite a real `audit` module existing | `AppContext.tsx:107`                                                                                 |
| Vendor availability calendar                           | Its own separate localStorage key                  | `lib/availability.ts:16`                                                                             |

There is also an **internal inconsistency worth fixing on its own**:
`/client/payments` honestly says "coming soon" (`App.tsx:96`), while
`/client/finances/transactions` renders fabricated transaction data right now
(`App.tsx:103`). The same user, two clicks apart, gets two different stories
about whether money features exist.

## 3. Why the top three gaps are the damaging ones

Not all missing features cost the same. These three break the product's
promise rather than its polish.

### 3.1 Money screens showing invented numbers

The worst of the set, because it is the only gap that is actively
misleading rather than merely absent.

A provider opens Finances and sees earnings. A client opens Transactions and
sees spend, and Budgets and sees a budget being consumed. Every one of those
figures is computed client-side from a `contracts` array that exists only in
that browser (`FinancesPage.tsx:11`, `TransactionsPage.tsx:11`).

The causal chain: a provider reads an earnings figure → believes they are
owed that amount → asks where the money is → discovers there is no ledger, no
payout, and no record on the other side. That is not a missing feature; that
is a platform that appeared to be holding their money and was not. Trust
lost that way does not come back, and it is the kind of thing that gets
screenshotted.

A "coming soon" page costs nothing. A fabricated balance costs the
relationship.

### 3.2 Messaging that only one person can see

`sendMessage` appends to a local array (`MessagesPage.tsx:115`). Nothing is
transmitted. Both parties can be typing into what looks like a conversation
and neither will ever receive the other's messages.

For an event marketplace this is not a peripheral feature — after a booking,
coordination _is_ the product. Times change, venues change, headcounts
change. A client who sends "can you arrive an hour earlier?" and gets silence
concludes the provider is unresponsive; the provider concludes the same about
the client. The platform manufactures the exact failure it exists to prevent,
and both users blame each other.

This is also the gap most likely to push users off-platform to WhatsApp — and
once coordination leaves, so does the platform's ability to see, arbitrate, or
monetise the transaction.

### 3.3 The hand-off where the two sides stop agreeing

Acceptance is real: the requirement is FILLED, the connection is a Postgres
row, both parties are notified. The contract that acceptance is supposed to
produce is not — `hireVendor` builds it in `localStorage`
(`AppContext.tsx:178`).

So the system's state splits at exactly the moment it matters most. The
client's browser holds a contract; the provider's browser holds a different
one, built from their own view; the server holds neither. "Your Hires"
disappears with a cleared cache. There is no shared, authoritative record of
what was agreed — which is what a contract _is_.

## 4. What comparable products do

Benchmarked against real platforms rather than intuition.

**Escrow / payment protection — absent here.** Upwork's fixed-price protection
requires the client to fund a milestone _before work begins_; funds are held
and released on approval, or automatically after 14 days if the client goes
silent. Only funded amounts are protected — anything agreed outside that flow
Upwork explicitly cannot help recover
([Upwork Help](https://support.upwork.com/hc/en-us/articles/211063748-How-Fixed-Price-Payment-Protection-works-for-freelancers-on-Upwork),
[Upwork Help](https://support.upwork.com/hc/en-us/articles/211062568-How-Upwork-protects-your-payments)).
Marché has no payment rail at all, funded or otherwise.

**Deposits at booking — the event-industry norm.** The Bash sends the deposit
to the vendor at the time of booking and caps it at $2,000, and advises a
written contract stating terms before any deposit or balance is paid
([The Bash](https://thebash.com/help/booking-vendors)). Event work is
date-locked and cancellations are expensive, which is precisely why this
industry front-loads a deposit. Marché's booking moves no money and produces
no server-side terms.

**On-platform messaging — universal.** Thumbtack's own platform covers lead
delivery, message threads and booking; quoting and messaging deliberately stay
inside the platform. Bark is built on posting a requirement and chatting
directly with providers
([Sharetribe on Bark](https://www.sharetribe.com/create/how-to-build-website-like-bark.com/),
[Thumbtack API report](https://supergood.ai/api-report-card/thumbtack)).
Marché's chat reaches no one.

**Two-way reviews with rules — the trust engine.** Fiverr has both sides
review, publishes only once both have submitted (or the window closes), keeps
public ratings to a rolling two-year window, and separates private feedback
used for internal quality scoring
([Fiverr Help](https://help.fiverr.com/hc/en-us/articles/360049982353-Leaving-and-managing-reviews-on-Fiverr)).
The Bash makes a point of never removing or editing reviews regardless of
rating ([The Bash](https://thebash.com/help/booking-vendors)). Marché's
reviews never leave the reviewer's browser, so no reputation accrues — which
means a marketplace with no basis for choosing between two unknown providers.

**Dispute resolution with a clock — absent.** Fiverr's Resolution Center gives
both parties 48 hours to accept or decline a cancellation or dispute
([Fiverr Help](https://help.fiverr.com/hc/en-us/articles/37332569612049-Using-the-Resolution-Center)).
Marché's dispute button writes to an array no one else can read.

## 5. Rewire vs. build from zero

These are not equal amounts of work, and lumping them together will make the
remaining effort look larger than it is:

**Rewire (logic exists, is pointed at the wrong place).** Contracts, reviews,
disputes, work diaries, saved talent, referrals, job alerts, the audit
dashboard. The state transitions, validation and UI are written and working;
what is missing is a schema, endpoints, and swapping the `AppContext` array
for an API client. The notifications module is the proof — the same move was
already made there.

**Build from zero.** Payments, escrow, deposits, payouts, invoicing. There is
no logic to re-point, and this bucket carries obligations the others do not:
a payment provider, KYC, refunds, chargebacks, tax handling, and money in
custody. Real-time messaging sits between the two — the UI exists, but
delivery to another person is genuinely new infrastructure.

The order that follows from this document is: **messaging, then contracts,
then reviews** (each a rewire, each restoring one broken half of the
post-booking experience), with payments last because it is the only one that
is a business decision as much as an engineering one. Before any of them,
the fabricated finance screens should say "coming soon" like `/client/payments`
already does — that is an afternoon's work and removes the only actively
misleading thing in the product.

---

## Sources

- [How Fixed-Price Payment Protection works for freelancers on Upwork](https://support.upwork.com/hc/en-us/articles/211063748-How-Fixed-Price-Payment-Protection-works-for-freelancers-on-Upwork)
- [How Upwork protects your payments](https://support.upwork.com/hc/en-us/articles/211062568-How-Upwork-protects-your-payments)
- [The Bash — Booking vendors FAQ](https://thebash.com/help/booking-vendors)
- [Leaving and managing reviews on Fiverr](https://help.fiverr.com/hc/en-us/articles/360049982353-Leaving-and-managing-reviews-on-Fiverr)
- [Using the Fiverr Resolution Center](https://help.fiverr.com/hc/en-us/articles/37332569612049-Using-the-Resolution-Center)
- [Sharetribe — How to build a website like Bark.com](https://www.sharetribe.com/create/how-to-build-website-like-bark.com/)
- [Thumbtack API report card](https://supergood.ai/api-report-card/thumbtack)
