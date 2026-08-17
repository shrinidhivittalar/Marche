# Marché

Upwork-style marketplace for the event industry — clients post requirements, service providers submit proposals.

Monorepo layout follows `CLAUDE.md` (Ellipsonic Engineering SOP):

- `apps/web` — the customer-facing app (Vite + React + TypeScript + Tailwind v4 + React Router)
- `packages/ui` — shared design-system components (ShadCN-style, Tailwind-based)
- `packages/config` — shared ESLint and TypeScript configs

## Getting started

```bash
npm install
npm run dev
```

This is currently a **static frontend MVP**: mock data only, no backend, no auth, no API calls.

## Running the end-to-end tests

The Playwright suite drives the real API against a real Postgres database —
its own, never the application's. It registers accounts, publishes listings
and deletes them again, so pointing it at the application database would put
that traffic into real data.

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
