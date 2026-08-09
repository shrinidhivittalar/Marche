# Module 4 — End-to-End Verification

Run on **2026-08-10** against the live API (`localhost:4000`) and the hosted
Neon database, not mocks. Every result below is from a real HTTP request.

---

## Migrations

Applied with `prisma migrate deploy` (not `migrate dev`, which can decide the
schema has drifted and offer to reset it — unsafe on a shared database).

| Migration                              | Effect                                       |
| -------------------------------------- | -------------------------------------------- |
| `20260809120000_add_jobs_module`       | `jobs` table, `JobStatus` enum, 4 indexes    |
| `20260809140000_add_job_attachments`   | `job_attachments` join table                 |
| `20260809160000_add_job_event_details` | event times, proposal deadline, deliverables |

All three are additive. No column was dropped and no existing row rewritten.
`prisma migrate status` afterwards: **"Database schema is up to date."**

This closes the "Prisma migrations succeed" acceptance criterion, which had
been unverified until now.

---

## Test accounts

Registered through the real `POST /auth/register`.

| Role     | Email                                         | Password        |
| -------- | --------------------------------------------- | --------------- |
| CLIENT   | `module4-client-20260810003734@marche.test`   | `Test1234!Pass` |
| PROVIDER | `module4-provider-20260810003734@marche.test` | `Test1234!Pass` |

**These are throwaway accounts on a development database.** The password is
recorded here because it protects nothing of value; it must never be reused
for a real account, and both accounts should be removed before this database
carries anything that matters.

### One manual database write, disclosed

`POST /auth/register` returns no token — it creates the account and sends a
verification email. `AuthService.login` then refuses an unverified account
(`auth.service.ts:133`), and the verification token is stored **hashed**, so
it cannot be read back out of the database and replayed.

With no mail access, the only way to exercise a single authenticated route
was to set `emailVerifiedAt` directly on the two test accounts. The update was
scoped to `email endsWith '@marche.test'`, so it could not touch a real user.
It affected exactly 2 rows.

Nothing else was written by hand. Every requirement below was created,
published and cancelled through the API.

---

## Results — 29 of 29 behaviours pass

### Discovery and validation (no authentication)

| Check                                     | Expected                        | Actual |
| ----------------------------------------- | ------------------------------- | ------ |
| `GET /jobs` on an empty table             | empty envelope, `totalPages: 0` | ✅     |
| `?sort=relevance`                         | 400, not silently aliased       | ✅ 400 |
| `?category=does-not-exist`                | 400                             | ✅ 400 |
| `?minBudget=500&maxBudget=100`            | 400                             | ✅ 400 |
| `GET /jobs/<unknown-uuid>`                | 404                             | ✅ 404 |
| `GET /jobs/me` with no token              | 401                             | ✅ 401 |
| `GET /jobs/:id/attachments` with no token | 401                             | ✅ 401 |

The last row is the private-attachments rule holding on a live server rather
than only in a unit test.

### Ownership and roles

| Check                                             | Expected | Actual |
| ------------------------------------------------- | -------- | ------ |
| Client creates a requirement                      | 201      | ✅     |
| **Provider** creates a requirement                | 403      | ✅ 403 |
| Owner reads own draft via `/jobs/me/:id`          | 200      | ✅     |
| Provider reads someone else's via `/jobs/me/:id`  | 403      | ✅ 403 |
| Provider attaches a file to another's requirement | 403      | ✅ 403 |
| Client attaches media they do not own             | 404      | ✅ 404 |

### Mass assignment

| Check                           | Expected                | Actual |
| ------------------------------- | ----------------------- | ------ |
| `PATCH { status: 'PUBLISHED' }` | 400, field not accepted | ✅ 400 |

Publishing is reachable only through `POST /jobs/:id/publish`. The DTO
allowlist refuses `status` outright rather than ignoring it.

### Cross-field validation

| Check                                  | Expected | Actual |
| -------------------------------------- | -------- | ------ |
| `eventEndTime` before `eventStartTime` | 400      | ✅ 400 |
| `proposalDeadline` after `eventDate`   | 400      | ✅ 400 |

### Lifecycle

| Check                                  | Expected | Actual              |
| -------------------------------------- | -------- | ------------------- |
| Draft hidden from `GET /jobs`          | absent   | ✅                  |
| Draft on the public detail route       | 404      | ✅ 404              |
| Draft deleted by its owner             | gone     | ✅ 404 after delete |
| Publish stamps `publishedAt`           | set      | ✅                  |
| Published requirement enters discovery | present  | ✅                  |
| Cancel removes it from discovery       | absent   | ✅                  |
| Republish a cancelled requirement      | 400      | ✅ 400              |
| Delete a cancelled requirement         | 400      | ✅ 400              |
| Owner still sees it in `/jobs/me`      | present  | ✅                  |

### Data fidelity

| Check                                             | Result                                                 |
| ------------------------------------------------- | ------------------------------------------------------ |
| `eventStartTime` / `eventEndTime` round-trip      | `18:00` / `23:00`, unchanged — no timezone shift       |
| `deliverables` round-trip                         | both items intact                                      |
| Keyword search (`?q=rooftop`)                     | found                                                  |
| `?minBudget=50000` against a 25,000–60,000 budget | **included** — tests the top of the range, as intended |
| `?minBudget=100000`                               | correctly excluded                                     |
| `?location=bandra` (case-insensitive)             | found                                                  |

The budget row is the one most likely to have been wrong: a requirement
offering 25k–60k _does_ satisfy a provider's 50k floor, and testing the wrong
end of the range would have silently hidden it.

---

## Browser results — 13 of 13 pass

`apps/web/e2e/jobs.spec.ts`, driven with Playwright against the same real API
and database. Each run creates its own tagged accounts and deletes them in
teardown.

| Journey                                                                               | Result |
| ------------------------------------------------------------------------------------- | ------ |
| Client posts a requirement, publishes it, provider finds it on the board and opens it | ✅     |
| Saved draft is reachable from the dashboard, as the toast promises                    | ✅     |
| Published requirement cancelled from the list                                         | ✅     |
| State filters count real requirements                                                 | ✅     |
| Draft never appears in provider discovery                                             | ✅     |
| Cancelled requirement leaves discovery                                                | ✅     |
| Client cannot reach the provider board                                                | ✅     |
| Wizard refuses an empty title                                                         | ✅     |
| Wizard refuses a description shorter than the API accepts                             | ✅     |
| Minimum with no maximum publishes as an open-ended budget                             | ✅     |
| Category list populated from the seeded taxonomy                                      | ✅     |
| Provider can browse the board                                                         | ✅     |
| All four sorts accepted by the API                                                    | ✅     |

### Two bugs the browser run found

**1. An open-ended budget could not be published.** The wizard read a maximum
left at zero as "less than the minimum" and blocked publishing, even though
the API accepts an open-ended range and the card renders it as "From
₹25,000". The mock hid it by pre-filling both budget fields; the rewired form
starts empty, so the first real client entering only a minimum would have hit
a wall with an error that made no sense. Fixed, with a regression test.

**2. The dashboard promised something it did not deliver.** Saving a draft
said "you can find it on your dashboard", and the dashboard still listed mock
data — so a real draft was reachable only by URL. The list now reads
`GET /jobs/me`. Fixed, with a test that asserts the promise specifically.

A third failure was my own test harness, not the product: `Invoke-WebRequest`
prompting in non-interactive mode made draft deletion look broken. Verified
separately — deletion works.

---

## Not tested

- **Attachments.** `apps/api/.env` has no `STORAGE_*` variables, so uploads
  fail with "storage is not configured" — the media module behaving as
  designed, failing only media requests instead of refusing to boot. The
  _authorisation_ around attachments was verified (401/403/404 above), and the
  UI states its file types and limits, but no file has ever been uploaded.
  Needs R2 credentials or local MinIO.
- **Event dates and times through the UI.** The API round-trip is verified
  above; the browser tests leave dates empty rather than driving the custom
  date and time widgets, which would test those components instead of this
  flow.

---

## Open gap: public discovery is unreachable in the UI

`GET /jobs` is deliberately public, and the provider detail page already
handles a signed-out reader ("Sign in to view the files"). But `App.tsx:227`
gates every `/provider/*` route to `role === 'vendor'`, and a signed-out
visitor defaults to `client` — so they are bounced to the client dashboard
and never reach the board.

The backend and the frontend disagree about who may browse requirements.
Nothing is broken or leaking; the public capability simply has no door.
Recorded rather than fixed, because changing app-wide routing is not Module
4's decision to make. Worth settling before launch: either open a public
route to the board, or drop the pretence that discovery is public.

---

## Left in the database

| Row                                                     | State               | Note                                              |
| ------------------------------------------------------- | ------------------- | ------------------------------------------------- |
| `E2E throwaway draft`                                   | DRAFT, soft-deleted | invisible everywhere                              |
| `Delete check`                                          | DRAFT, soft-deleted | invisible everywhere                              |
| `Wedding photographer for a 200-guest rooftop ceremony` | **CANCELLED**       | not discoverable; visible to the test client only |
| 2 test users                                            | verified            | `@marche.test`                                    |

The cancelled requirement cannot be hard-deleted through the API — deletion is
drafts-only by design, and cancelling is the published path. Removing it means
a direct database delete, which is worth doing before this database holds
anything real.

`job_attachments`: 0 rows.
