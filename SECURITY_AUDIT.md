# Marché — Production Security Audit

One question, asked of the whole app: **if an anonymous attacker hit this on
the public internet today, what could they actually do?**

This is not spec compliance. Nothing here is "doesn't match module2.md" — every
finding is something that would get exploited, or an operational failure that
would take the service down. Read-only audit; nothing was changed.

Against `main` at `eab8117`, deployment target Render (`render.yaml`,
`plan: standard`, behind a proxy).

---

## Findings

### 1. HIGH — Rate limiting is in-memory and per-instance

`apps/api/src/app.module.ts:56` — `ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }])`
with no `storage`, so the default per-process Map. Auth routes are 5/min
(`identity/controllers/auth.controller.ts:34,54`).

**Exploit:** credential stuffing against a leaked password list.

```
POST /auth/login  {"email":"victim@corp.com","password":"<next from list>"}
```

The counter lives in one process's memory, so the real limit is 5/min × number
of instances, and every deploy or restart resets it to zero. Nothing locks an
account after N failures — there is no lockout logic in `auth.service.ts` — so
the attempt budget is unbounded over time. A rotating IP pool multiplies it
again, since the key is the client IP.

**Mitigating:** the password policy is genuinely strong — 10 characters with
upper, lower and digit (`dto/password.constants.ts:4`, `dto/register.dto.ts:14`),
well above the usual 8. Blind brute force is unrealistic. Stuffing reused
credentials is the live risk. `AUTH_RATE_LIMIT` is also parsed defensively, so
a typo cannot silently disable it.

This is the already-known throttler gap, now with a concrete exploit attached.

### 2. MEDIUM — Prisma never disconnects on shutdown; Neon connection exhaustion

`apps/api/src/prisma/prisma.service.ts:10` defines `onModuleDestroy`, but
`apps/api/src/main.ts` never calls `app.enableShutdownHooks()` — verified
absent — so Nest never invokes it. On SIGTERM the process dies with its pool
still open. `packages/db/src/client.ts:7` constructs `new PrismaClient()` with
no connection limit, and `apps/api/.env.example` only _comments_ that you
should append `?connection_limit=5`.

**Failure sequence:** during a rolling deploy the old instance holds its pool
while the new one opens another; add the build step's `migrate deploy` and
seed, and Neon's ceiling is reachable — after which every request 500s until
Neon reaps the dead connections. An attacker who notices your deploy window
can amplify this by holding concurrent requests open across it.

Availability, not data exposure — but it is the most likely way this service
falls over on a normal Tuesday.

### 3. MEDIUM — `/auth/register` is an unauthenticated email cannon

`identity/services/auth.service.ts:113`, `identity/email/email.service.ts:49`.

**Exploit:** `POST /auth/register` with any victim's address. If the account
exists they get a "someone tried to sign up" notice; if it doesn't they get a
verification mail. Either way an attacker sends mail **from your domain** to an
arbitrary address, from a botnet, at 5/min per IP per instance. The cost is
your SMTP reputation and, eventually, a blocklisted sending domain.

**Mitigating:** it is throttled, the duplicate mail carries no token, and the
notification is deliberate anti-enumeration design (documented at
`auth.service.ts:94-104`). The gap is that the limit is per-IP with no
per-_email-address_ cap.

### 4. LOW–MEDIUM — Reset tokens ride in URL query params

`identity/email/email.service.ts:34,60` — `?token=<hex>`. Tokens land in
browser history and in any CDN/proxy log on the frontend origin. The reset page
also loads Google Fonts (`apps/web/index.html:8-12`), a cross-origin
subresource whose `Referer` would carry the token.

**Largely mitigated:** browsers default to `strict-origin-when-cross-origin`,
which strips the query string cross-origin. The API side is scrubbed
carefully — `app.module.ts:41-49` rewrites `req.url` precisely because pino's
`redact` cannot scrub a substring. Residual risk is shared browser history plus
the absence of an explicit `Referrer-Policy` on the frontend (helmet covers the
API only; the frontend is not in `render.yaml` at all).

### 5. LOW — No refresh-token reuse detection

`auth.service.ts:203-218`. Rotation is correct: single-use, revoke then reissue.
But replaying an already-revoked token merely 401s — it does not revoke the
session family. An attacker who steals a refresh cookie and uses it _first_
holds a valid 30-day chain while the victim is silently logged out, and you get
no signal that a theft happened. Mitigated by the cookie being httpOnly,
`path=/auth`, `Secure` and `SameSite=none` in production, so stealing it takes
more than XSS on an ordinary page.

---

## Checked and clean

This half matters as much as the findings — it is what you do _not_ need to
worry about.

- **Edge/proxy** — `main.ts:23` sets `trust proxy: 1`. Exactly one hop, correct
  for Render. `req.ip` is real, so throttling and `sessions.ipAddress` are not
  silently keyed to the load balancer.
- **Enumeration and timing** — unusually well done. Register returns an
  identical 201 either way and argon2-hashes on **both** branches
  (`auth.service.ts:110`); login verifies against a dummy hash on user-not-found
  (`:149`); forgot-password detaches post-lookup work behind a 250ms floor
  (`:39-47,264`). No status, body, or timing oracle found.
- **Auth enforcement** — `jwt.strategy.ts:34` re-reads the user on every
  request and rejects non-`ACTIVE`/soft-deleted, so a suspension takes effect
  within one request rather than one token lifetime. `emailVerifiedAt` is
  checked only at login, but no path issues a JWT without logging in, so
  unverified users cannot reach protected endpoints.
- **Swagger** — env-gated at `main.ts:49`; not built at all when
  `NODE_ENV=production`, which `render.yaml` sets.
- **CORS** — `main.ts:44-47`, exact `FRONTEND_ORIGIN`, no wildcard, no regex,
  correctly paired with `credentials: true`.
- **Client-side tokens** — access token is React state only
  (`AppContext.tsx:317`), never persisted; not lootable by XSS. No
  `dangerouslySetInnerHTML`, `innerHTML` or `eval` anywhere in `apps/web/src`.
  Only `import.meta.env` use is `VITE_API_URL` — no secrets in the bundle.
- **SQL injection** — zero `$queryRawUnsafe`/`$executeRawUnsafe` in the repo.
  All Prisma query-builder.
- **IDOR** — spot-checked clean. Media enforces `ownerUserId`
  (`media.service.ts:196-208`). Proposals have three distinct gates
  (`proposals.service.ts:444,475,493`), and `findForJob` re-checks
  `proposal.jobId === job.id` (`:298`), blocking the pair-a-foreign-proposal-
  with-my-job trick.
- **Media/upload** — keys are server-generated `users/<uid>/<uuid>`, so no
  traversal and no cross-user overwrite. Content type and length are signed
  into the presigned PUT (`storage.service.ts:87-92`), size re-verified from
  `HeadObject`, and magic bytes checked via a 16-byte range read. Bucket
  private, reads via short-lived signed URLs.
- **SSRF / user-controlled URLs** — nothing server-side fetches a user-supplied
  URL. `website` and `socialLinks` are scheme-validated and only rendered as
  links.
- **Mass assignment** — global `ValidationPipe` with `whitelist` +
  `forbidNonWhitelisted` (`main.ts:26-30`), and services enumerate fields
  rather than spreading DTOs.
- **Role escalation** — admin checks read the role from the freshly-loaded DB
  user, not the JWT claim.
- **Error handling** — default Nest filter returns a bare
  `{"statusCode":500,"message":"Internal server error"}`; stack traces go to
  stdout only. Redaction covers `authorization`, `cookie`, `password`,
  `newPassword`, `query.token`.
- **Dependencies** — nothing abandoned. NestJS 11, Prisma 6, argon2 0.41,
  helmet 8, AWS SDK v3 all current. `"@types/node": "latest"` and
  `"eslint": "latest"` are unpinned, which is a reproducibility and
  supply-chain smell rather than an exploit.

---

## Verdict

The application-logic security is better than most production codebases —
the enumeration and timing work in particular is careful in ways that are
usually skipped. **The real exposure is operational, not logical:** findings 1
and 2 are both about what happens when this runs as more than one process
behind a load balancer, which is exactly what `render.yaml` describes.

Suggested order: shutdown hooks and a Neon connection limit (small, removes
the most likely outage), then shared throttler storage (the already-planned
Redis decision), then a per-email registration cap.
