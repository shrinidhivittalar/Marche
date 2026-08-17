# Marché

Upwork-style marketplace for the event industry — clients post requirements,
service providers submit proposals, and an accepted proposal connects the two.

## What works today

The core marketplace transaction runs end to end against a real API and a real
database, with no mocks in the path:

```
client posts a requirement → provider browses and proposes →
client accepts → requirement filled, competing proposals declined,
connection established → both parties notified
```

Backed by their own API modules: **identity** (registration, email
verification, login, rotating refresh tokens), **profiles** (skills,
experience, education, languages, visibility, public pages), **marketplace**
(service listings, search, filters, provider discovery), **media** (uploads
for avatars, portfolios and service images), **jobs** (requirements and their
lifecycle), **proposals** (submission, withdrawal, accept/decline, and the
connection an acceptance opens), and **notifications** (in-app, for proposal
and job events). Two smaller ones sit behind those: **audit** and **ai**, the
latter powering the one "Rephrase with AI" button on the job form.

Not yet built: contracts, payments, messaging, reviews, disputes and work
diaries. Screens for some of those exist in the web app and render **mock data
from `AppContext`** — they are not wired to anything, and the numbers on them
are not real.

## Layout

Monorepo layout follows `CLAUDE.md` (Ellipsonic Engineering SOP):

- `apps/web` — the customer-facing app (Vite + React + TypeScript + Tailwind v4)
- `apps/api` — the backend (NestJS 11, Prisma, PostgreSQL, JWT + argon2, S3 media)
- `packages/db` — Prisma schema, migrations and seed
- `packages/ui` — shared design-system components (ShadCN-style, Tailwind-based)
- `packages/config` — shared ESLint and TypeScript configs

Node is pinned by `.nvmrc` (20.18.0), the package manager by `packageManager`
in `package.json`.

## Getting started

```bash
npm install
```

Copy the `.env.example` files and fill them in:

- `packages/db/.env` — `DATABASE_URL` (PostgreSQL; Neon in practice)
- `apps/api/.env` — the same `DATABASE_URL`, plus `JWT_ACCESS_SECRET` and
  `FRONTEND_ORIGIN`

Everything else in `apps/api/.env.example` is optional and degrades on its
own terms: without SMTP, verification and reset links are logged to the
console instead of emailed; without `STORAGE_*`, the API still starts and
only uploads fail; without `GROQ_API_KEY`, one button on the job form errors.

Then apply the schema and seed the reference data (skills and the category
taxonomy):

```bash
npm run db:deploy
npm run db:seed
```

Run everything:

```bash
npm run dev            # web + api via turbo
npm run dev:web        # or one at a time
npm run dev:api
```

The API serves Swagger at `/docs`. The web app reads its API base from
`VITE_API_URL` and falls back to `http://localhost:4000`.

## Testing

```bash
npm run lint
npm run typecheck
npm test               # api unit + integration specs (the only workspace with tests)
```

`apps/api` has 32 unit spec files that need no database, plus integration
specs that do — including the concurrency spec that proves two clients cannot
fill the same requirement at once.

### The test database

Both the integration specs and the Playwright suite write real rows:
accounts, listings, requirements, proposals. They run against their own
database, never the application's, so that a teardown which fails half-way
cannot leave that in real data.

One-time setup — create a second database at your Postgres provider (on Neon,
Console → Databases → New database), put its connection string in
`packages/db/.env` as `TEST_DATABASE_URL`, then:

```bash
npm run db:test:prepare   # migrate + seed the test database
```

Both suites refuse to start if `TEST_DATABASE_URL` is missing or identical to
`DATABASE_URL`.

### End-to-end

9 Playwright spec files drive the real browser against the real API. From
`apps/web`:

```bash
npm run e2e
npm run e2e:ui
```

They start their own API and web servers on dedicated ports, so a run never
collides with — or drives — a `npm run dev` someone is using.
