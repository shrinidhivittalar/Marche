---
name: prod-security-audit
description: Adversarial, spec-independent "would this survive going live on the public internet right now" security and production-readiness audit. Use when the user asks things like "is this exploitable", "what are the real gaps before I release this", "security audit before launch", "if I ship this today what breaks", or wants to know what an anonymous attacker could actually do — as opposed to compliance against internal spec/requirements docs (module*.md, feature-gap docs), and as opposed to reviewing a specific PR/diff (use the `security-review` skill for that).
---

# Production Security Audit

A full-app audit that ignores internal spec/requirements documents entirely and asks one question: **if an anonymous attacker hit this app on the public internet today, what could they actually do?** Every finding must be a concrete request/attack, not a hypothetical or a missing-nice-to-have.

## When to use this vs. other review tools

- Diff/PR-scoped review of pending changes → use `security-review` or `/code-review`, not this.
- "Does this match module2.md / the spec" → that's compliance, not this skill.
- "Is this production-ready / exploitable / safe to launch" → this skill.

## Procedure

1. **Scope the stack first** (don't skip — the checklist below is generic, the audit shouldn't be). Identify: backend framework, ORM/DB, frontend framework, auth mechanism (JWT/session/cookie), deployment target if known (affects proxy/CORS assumptions).

2. **Delegate to a single foreground agent** (this is a big read-heavy task; keep it out of the main context window). Use `general-purpose` with `model: opus` if available, `run_in_background: false` since the user is waiting on the result. Give it the checklist below adapted with real file paths for this repo — a generic checklist produces generic findings, so name actual files (main.ts / bootstrap, the auth module, the DB module, package.json, .env.example, frontend token storage) before launching.

3. **Checklist to cover** (adapt paths per stack, don't skip categories just because one doesn't apply — say "N/A, no file uploads exist" rather than omitting):
   - **Edge/proxy correctness**: `trust proxy` (or equivalent) set correctly — without it, rate limiting and IP-based audit logging silently collapse to the load balancer's IP in any real deployment (Render/Railway/Vercel/nginx/Cloudflare all proxy).
   - **Auth enforcement gaps**: is every verification/flag that's _collected_ (email verified, KYC, etc.) actually _checked_ anywhere downstream, or just stored and ignored?
   - **Enumeration & timing oracles**: do register/login/forgot-password responses (status code, timing, message) let an attacker distinguish "account exists" from "account doesn't"? Check whether a hash comparison (bcrypt/argon2) is skipped on the not-found path, creating a timing gap even if the response body is otherwise silent.
   - **Public exposure of internals**: is API documentation (Swagger/OpenAPI/GraphQL introspection) reachable without auth or an env gate in production? Is it excluded from access logs (making probing invisible)?
   - **Secret/token leakage via infrastructure**: do single-use tokens (email verification, password reset) travel as URL query params that will land in access logs or leak via the `Referer` header from the page that renders them?
   - **Rate limiting robustness**: does throttling use in-memory storage that resets on every deploy and is per-instance (not shared) behind a multi-instance/load-balanced deployment?
   - **Password/credential policy**: is there anything beyond a bare minimum length? Would a rate limit that's soft (previous bullet) plus a weak policy make credential stuffing realistic?
   - **User-controlled URLs rendered/fetched server-side or on public pages**: avatar/image/webhook URL fields — any SSRF risk if ever fetched server-side (thumbnailing, link previews, webhook delivery), any unauthenticated tracking-pixel risk today even without server-side fetch?
   - **DB connection hygiene**: is there a shutdown hook that disconnects the client, and a pool/connection limit appropriate for the DB provider (matters a lot for serverless-Postgres providers like Neon)?
   - **CORS**: is the allowed origin actually restricted, or wide open (`*` or unset)?
   - **Client-side token storage** (frontend): tokens in `localStorage`/`sessionStorage` (XSS-exploitable) vs. memory or httpOnly cookies; any `dangerouslySetInnerHTML`/`eval`/`innerHTML` with unsanitized input; hardcoded secrets/API keys shipped to the client bundle.
   - **Raw SQL / injection surface**: any string-interpolated queries bypassing the ORM's parameterization.
   - **Dependency red flags**: skim `package.json` for obviously outdated/abandoned critical packages — not an exhaustive CVE sweep, just obvious red flags.
   - **Error handling**: do unhandled exceptions leak stack traces or internal details when not in development mode?

4. **Report format** — for every finding: severity (Critical/High/Medium/Low), file:line, a concrete exploit scenario written as an actual request/sequence an attacker would send (not "this could be a problem" hand-waving), and explicitly state whether anything already fixes it. Rank most severe first. Also list what was checked and found clean — a clean bill on a category is a finding too, it tells the user what they don't need to worry about.

5. **Do not fix anything during the audit** — it's read-only investigation. After reporting, offer to fix the top N items, and let the user pick priority (some "gaps" may be intentional product decisions documented elsewhere — check before assuming a gap is a bug, same as any other review).

## Notes from prior runs

- Keep the report itself under ~600 words in the final user-facing summary even if the agent's internal investigation is longer — link severity to exploitability, not volume of findings.
- Distinguish this explicitly from spec-compliance gaps in the response, so the user knows these are "would get exploited" issues, not "doesn't match the doc" issues.
