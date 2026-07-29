# CLAUDE.md

# Ellipsonic Engineering Constitution

This repository follows the Ellipsonic Engineering Standard Operating Procedure (ELPS-ENG-SOP-001).

The SOP defines the engineering standards, security requirements, review process, deployment practices, and quality expectations for this repository.

The implementation philosophy follows the Ponytail project.

Ellipsonic SOP defines **what** must be built.
Ponytail defines **how** it should be built.

Claude must treat both as a single engineering standard, and treat the behavioral guidelines below as how that standard gets executed turn-by-turn.

The objective is to produce production-quality software that is secure, maintainable, readable, modular, and simple.

**Tradeoff note:** these guidelines bias toward caution over speed. For trivial tasks, use judgment.

---

# Sources of Truth

Whenever making engineering decisions, Claude must use the following order of precedence.

1. Existing code in this repository
2. This CLAUDE.md
3. Ellipsonic Engineering SOP (ELPS-ENG-SOP-001)
4. Ponytail engineering philosophy
5. Official framework documentation
6. General software engineering best practices

Never ignore a higher-priority source. Consistency is more important than novelty.

---

# 1. Workspace & Directory Structure

- **Monorepo Architecture:** All multi-app projects use a monorepo managed with Turborepo or Nx. Shared code lives in `packages/`, deployable applications live in `apps/`. Shared logic must never be duplicated across apps.
- **Standard Layout:**
  - `apps/<app-name>`: Deployable applications
  - `packages/ui`: Shared ShadCN/Tailwind components
  - `packages/config`: Shared ESLint, TypeScript, Tailwind configs
  - `packages/db`: Prisma/Drizzle schema, migrations, seed scripts
  - `packages/validators`: Shared Zod/Joi schemas
  - `packages/lib`: Shared utilities, API clients, wrappers
- **Naming Conventions:** Folders/files use `kebab-case`. React components use `PascalCase` exports in `kebab-case` files. Env variables use `SCREAMING_SNAKE_CASE`.
- **Version Pinning:** Node.js and package manager versions must be explicitly pinned via `.nvmrc` and `engines` in `package.json`.

---

# 2. Git Workflow & Quality Gates

- **Branching Strategy:** Trunk-based development with short-lived feature branches. No direct commits to `main` or `staging` under any circumstance. Use prefixes: `feature/*`, `fix/*`, `chore/*`, `docs/*`.
- **Commit Messages:** Follow Conventional Commits format: `type(scope): short description` (e.g., `feat(auth): add refresh token rotation`).
- **Automated CI Gates:** Automated status checks (lint, type-check, tests, build) must pass via CI before any PR is mergeable.

---

# 3. Development & Architecture Standards

### Backend Development
- **RESTful APIs:** Version all APIs (`/api/v1/...`) and use consistent success/error response envelopes.
- **Middleware:** Implement cross-cutting concerns (auth, logging, rate limiting, request-ID tagging, error handling) in middleware, not inside individual route handlers.
- **Auth & Encryption:** Passwords must be hashed using `bcrypt`/`argon2`. JWT access tokens must be short-lived; refresh tokens must be rotated and stored in `httpOnly`, secure cookies. Server-side RBAC is mandatory on every protected route.

### Frontend Development
- **UI Stack:** Default to ShadCN UI components + Tailwind CSS for all UI work. Custom CSS is reserved only for edge cases.
- **Component Architecture:** Compose components; check `packages/ui` before writing a new one. Extract business logic into custom hooks. Manage server state with TanStack Query rather than manual `useEffect` fetches.
- **Accessibility:** Ensure UI is responsive and meets WCAG standards (semantic HTML, contrast, keyboard navigation).

### Database Standards
- **Engine:** PostgreSQL (via Prisma/Supabase) is the default RDBMS.
- **Migrations:** All schema modifications must go through version-controlled migration files—never manual changes on shared/staging databases. Schema updates require primary keys, foreign keys, and indexes on queried columns.

### Third-Party Integrations
- **Wrappers:** Wrap all external API calls in a dedicated client module (`packages/lib`), never ad-hoc inside components or route handlers.
- **Resilience:** Configure explicit timeouts and exponential backoff retries for all external calls. Verify signatures on incoming webhooks.

---

# 4. Security & Data Handling

- **Secrets Hygiene:** Secrets live only in platform environment variables (e.g., Vercel) or secret managers—never in `.env` files committed to Git.
- **Boundary Validation:** Schema-validate every incoming API request and outgoing response at the boundary using Zod/Joi.
- **OWASP Compliance:**
  - Enforce parameterized queries only (no raw string-interpolated SQL).
  - Use output encoding/sanitization and CSP headers.
  - Enforce CSRF protection on state-changing requests and rate-limiting on public/auth endpoints.

---

# 5. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

Whenever an implementation decision is required, also ask: **"How would Ponytail implement this?"**

Claude should mirror Ponytail's project organization, folder hierarchy, utility design, service structure, React patterns, backend organization, naming conventions, error handling, validation approach, code formatting, and modularity. Do not invent a different architecture when Ponytail already provides a proven pattern.

---

# 6. Simplicity First (YAGNI)

**Minimum code that solves the problem. Nothing speculative.**

YAGNI is mandatory. Implement only what is required today. Do not engineer for hypothetical future requirements.

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Do NOT introduce, unless the repository already requires them:
- plugin systems
- strategy patterns
- repository patterns
- dependency injection containers
- factories
- service locators
- event buses
- generic abstraction layers
- unnecessary wrappers
- excessive configuration
- framework-like code

If only one implementation exists, write one implementation. Generalize only after there are multiple real use cases. Small, boring code is preferred over clever code.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

---

# 7. Surgical Changes & Existing Patterns

**Touch only what you must. Reuse before you invent.**

Before writing any code, Claude MUST:
1. Search the existing repository.
2. Search for similar implementations.
3. Reuse existing utilities.
4. Extend existing services where appropriate.
5. Follow the established folder structure and naming conventions.

Only introduce a new pattern if no suitable pattern already exists. Consistency is always preferred over creating a "better" solution.

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it — don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

**The test:** every changed line should trace directly to the user's request.

Never rewrite working code unless explicitly requested. Never replace an existing pattern simply because another pattern exists. Never sacrifice consistency for novelty.

---

# 8. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

# Coding Philosophy

Code should be readable before it is clever. Apply the following principles everywhere.

- DRY
- KISS
- YAGNI
- SOLID only when it genuinely simplifies the codebase

Prefer: explicit code, descriptive names, pure functions, composition, early returns, focused modules, reusable utilities.

Avoid: giant classes, deeply nested logic, duplicated business logic, magic numbers, hidden side effects, premature optimization.

---

# Engineering Goals

Every change should improve at least one of the following without making another worse:

- Readability
- Security
- Maintainability
- Testability
- Modularity
- Performance
- Developer Experience

Avoid unnecessary complexity, dependencies, abstractions, and files. Prefer deleting code over adding infrastructure.

---

# Claude Operating Instructions

Before implementing any feature, Claude MUST:

1. Understand the existing architecture.
2. Search the repository.
3. Identify existing patterns.
4. Follow Ponytail's implementation style.
5. Produce the smallest correct implementation.
6. Avoid introducing unnecessary abstractions.
7. Keep changes localized.
8. Explain architectural decisions when introducing new modules.
9. Update documentation if behavior changes.
10. Ensure the implementation complies with the Ellipsonic SOP.

Write code that another engineer can understand in under five minutes. Always think like the reviewer of your own pull request.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.
