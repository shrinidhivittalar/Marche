# What is Marché?

## The idea

Marché is a marketplace connecting people planning events (weddings,
corporate launches, parties) with the people who provide services for
them — photographers, caterers, DJs, decorators, planners, sound/AV crews.
Think Upwork, but scoped to the event industry instead of general freelance
work.

A client posts what they need — category, budget, event date, location.
Providers browse open requirements and send proposals with their price and
timeline. The client picks one, and from there the two of them run the
whole booking on the platform: pay, message, track progress, confirm it
happened, and review each other afterward.

## Why event services specifically

General freelance platforms don't fit this well. Event work has a few
things that make it different:

- **There's a hard date.** Unlike ongoing freelance work, an event either
  happens or it doesn't, on a specific day. That shapes a lot of the
  product — when payment happens, when the booking is considered "done,"
  what happens if someone goes silent.
- **Payment is usually upfront.** The industry norm is paying in full (or a
  deposit) at booking time, not on delivery — so that's what this platform
  does, rather than copying a freelance platform's pay-on-milestone model.
- **"Delivery" means something concrete** — showing up and doing the job on
  the day, sometimes followed by handing over edited photos/footage
  afterward. That's why proposals ask for a turnaround time in days: it's
  how long after the event a provider commits to delivering the final
  work, not a generic project deadline.

## What stage this is at

This is a working product, not a prototype with placeholder screens. Every
core flow — post a job, get proposals, hire, pay, message, complete, review
— runs against a real database and a real payment processor (in test mode).
Nothing on that path is mock data pretending to be real.

A few supporting features (Direct Contracts, Disputes, Work Diary, Saved
Talent, Referrals) are also real, built once the core loop was solid, in
the order they'd actually matter to someone using the product day to day —
not just because they were easy to add.

One thing is deliberately not built yet: a separate "Contracts" concept
beyond the booking relationship (called a Connection) that already exists
once a proposal is accepted. The Contracts tab in the nav is a locked
preview for now.

## Who's building it, and how

Built solo, with Claude Code doing the implementation work under a fairly
strict engineering standard (see `CLAUDE.md`) — real code review passes,
security audits, and live verification rather than trusting a diff alone.
Decisions about product behavior (what "complete" means, how payment
timing works, what happens if a booking goes wrong) were made deliberately
and are recorded in commit messages and code comments, not just assumed.

If you're picking this up for the first time: read `README.md` for how to
run it, `TESTING_GUIDE.md` for what the app actually does end to end, and
`RELEASE_NOTES.md` for what's changed recently. `CLAUDE.md` explains the
engineering standard the codebase follows, if you're going to keep building
on it.
