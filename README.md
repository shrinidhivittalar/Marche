# Marché

Upwork-style marketplace for the event industry — clients post requirements,
service providers submit proposals, and an accepted proposal connects the two
for the rest of the booking (payment, messaging, completion, reviews).

## What's real

The full marketplace transaction runs end to end against a real API and a
real Postgres database — no mock data on the golden path:

```
client posts a requirement → provider browses and proposes →
client accepts → competing proposals declined, connection established →
client pays (Razorpay) → both parties message and post work-diary
updates → client confirms completion (or it auto-completes after the
event) → both sides review each other → provider is paid
```

Backed by their own API modules under `apps/api/src`:

- **identity** — registration, email verification, login, rotating refresh tokens
- **profiles** — skills, experience, education, languages, visibility, public pages
- **marketplace** — service listings, search, filters, provider discovery, categories
- **media** — uploads for avatars, portfolios, service images and job attachments
- **jobs** — requirements and their lifecycle (draft → published → filled/cancelled)
- **proposals** — submission, withdrawal, accept/decline, the connection an acceptance opens
- **direct-contracts** — a client hiring a specific provider directly, provider consent required
- **messages** — real-time-polled chat on a connection
- **work-diary** — dated activity updates either party can post on a connection
- **payments** — Razorpay checkout + webhook, client pays in full at hire time
- **reviews** — two-way, blind until both sides submit or 14 days pass
- **disputes** — either party can raise one, reviewed by an admin
- **notifications** — in-app notifications for proposals, connections, jobs, payments, disputes
- **saved-providers**, **referrals** — smaller supporting modules
- **ai** — one feature: "Rephrase with AI" on the job-posting form, via Groq

**Not real yet:** the Contracts tab shown in the app's nav is a locked/blurred
preview (`ComingSoonOverlay`) — there's no separate "contract" concept beyond
the Connection a proposal acceptance already creates.

## Layout

Monorepo layout follows `CLAUDE.md` (Ellipsonic Engineering SOP):

- `apps/web` — the customer-facing app (Vite + React + TypeScript + Tailwind v4 + React Router)
- `apps/api` — the backend (NestJS 11, Prisma, PostgreSQL, JWT + argon2, S3-compatible media storage)
- `packages/db` — Prisma schema, migrations and seed (category taxonomy + skills)
- `packages/ui` — shared design-system components (ShadCN-style, Tailwind-based)
- `packages/config` — shared ESLint and TypeScript configs

Node is pinned by `.nvmrc` (20.18.0), the package manager by `packageManager`
in `package.json` (npm 11.11.1).

## Getting started

```bash
npm install
```

Copy each `.env.example` to `.env` in the same folder (`apps/api`, `apps/web`,
`packages/db`) and fill in the values — see each file's comments for where
each one comes from and which are required vs optional.

The database is a hosted Neon Postgres instance, not local. Once `DATABASE_URL`
is set:

```bash
npm run db:generate   # generate the Prisma client
npm run db:deploy     # apply migrations (never db:migrate against a shared DB)
npm run db:seed       # seed the category taxonomy and skill list
```

Then, from the repo root:

```bash
npm run dev            # both apps/web (Vite) and apps/api (NestJS) via turbo
# or individually:
npm run dev:web
npm run dev:api
```

Web runs at `http://localhost:5173` (or the next free port), API at
`http://localhost:4000`.

## Running the tests

```bash
npm run lint
npm run typecheck
npm run test        # unit + integration, per package
```

The Playwright end-to-end suite drives the real API against a **second**,
dedicated Postgres database — never the application's `DATABASE_URL`. It
registers accounts, publishes listings and deletes them again, so pointing it
at real data would corrupt it.

One-time setup: create a second database at your Postgres provider (on Neon,
Console → Databases → New database), put its connection string in
`packages/db/.env` as `TEST_DATABASE_URL`, then:

```bash
npm run db:test:prepare   # migrate + seed the test database
```

Then, from `apps/web`:

```bash
npm run e2e
```

The suite refuses to start if `TEST_DATABASE_URL` is missing, or if it is the
same as `DATABASE_URL`.
