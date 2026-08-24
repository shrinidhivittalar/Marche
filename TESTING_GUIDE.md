# How Marché works, and what to test

Written for someone who hasn't seen the code — this explains the app the way
a real user would experience it, and what to check at each step.

There are two kinds of accounts: **clients** (people who need something for
an event — a photographer, caterer, DJ) and **providers** (people who offer
that service). One email can only be one or the other, not both.

## The main flow — do this first

This is the golden path. Walk through it once, start to finish, using two
separate accounts (one client, one provider) so you can see both sides.

1. **Sign up as a client.** Verify the email (or check the server console if
   SMTP isn't configured — the link gets logged there instead of sent).
2. **Post a requirement.** Category, title, description, budget, event date
   and location. You can save it as a draft and come back, or publish it
   right away.
3. **Sign up as a provider (different email, different browser/incognito).**
   Fill in a profile — skills, experience — and create at least one service
   listing.
4. **As the provider, find the client's requirement** (Search Jobs) and
   submit a proposal — a price and a turnaround time in days.
5. **As the client, open the requirement and accept the proposal.** Check
   that: the job now shows as filled, any other proposals on it show as
   declined, and both accounts get a notification.
6. **Pay for the booking.** This opens Razorpay's real test-mode checkout —
   use a dummy card (`4111 1111 1111 1111`, any future expiry, any CVV, OTP
   `1111`). Check that the payment shows as paid on the client side _and_
   the provider gets a "payment received" notification without refreshing.
7. **Message each other** on the connection. Post a Work Diary update from
   either side.
8. **Confirm completion.** As the client, once the event date has passed,
   there's a "Confirm Completion" button. (If you don't want to wait, you
   can also just check that the messaging works — completion is dated on
   the event, not something to force in a demo.)
9. **Leave a review of each other.** Check that a review stays hidden from
   the public profile until both sides have submitted one, or 14 days pass.

If all nine steps work, the core product works.

## What to specifically look for while doing that

- **Notifications** — should appear without a page refresh (they poll every
  few seconds). Check the bell icon updates its unread count.
- **Role separation** — try opening a client-only URL while logged in as a
  provider (and vice versa). You should get bounced to your own dashboard,
  not an error page.
- **Cancel a requirement** before it's accepted — providers who proposed on
  it should get notified it's no longer open.
- **Edit a published requirement** as the client — this should work now
  (it didn't used to; a provider who already proposed still sees the old
  terms they proposed against, this doesn't retroactively change their
  proposal).

## Other real flows, worth a pass but not the main one

- **Direct Contracts** — a client can hire a specific provider directly
  from their profile, skipping the public job post. The provider has to
  accept or decline the offer — a client can't force this on someone.
- **Disputes** — either party can raise one on a connection at any point.
  It goes to an admin, not resolved automatically by either side.
- **Saved Talent** — a client can save a provider's profile for later.
- **Referrals** — inviting someone by email; if they sign up with that
  exact email, the referral marks itself joined automatically.
- **"Rephrase with AI"** — a sparkle icon on the job-posting form's title
  and description fields. Type something rough first, then click it —
  it cleans up the wording without inventing new details.

## What's deliberately not real yet

- **The Contracts tab** in the sidebar nav is locked/blurred with a "Coming
  Soon" message. Don't file this as a bug — it's intentional. The actual
  booking relationship lives in Connections, reachable from a job or
  proposal's detail page, not from that tab.
- There's no admin login flow in this build to walk through the audit
  dashboard yourself — it exists, but isn't part of a normal signup path.

## If something looks broken

Check whether it's a **polling delay** first — several screens (messages,
notifications, payment status) refresh every few seconds rather than
instantly. Waiting 5-10 seconds and checking again rules out "it just
hasn't synced yet" before treating it as a real bug.
