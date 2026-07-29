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
