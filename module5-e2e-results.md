# Module 05 — Proposals: verification results

Run on 2026-08-10 against the hosted Neon database, the built API and the
real web app. Nothing here was mocked except where stated.

---

## Summary

| Layer                     | Command                                   | Result         |
| ------------------------- | ----------------------------------------- | -------------- |
| API unit + HTTP           | `npm test -w @marche/api`                 | 442 passed     |
| Real-database concurrency | `npm run test:integration -w @marche/api` | 5 passed       |
| Browser, whole suite      | `npx playwright test` (in `apps/web`)     | 72 passed, 21m |

Of those, Module 05 contributes 123 unit tests, 52 HTTP behaviours, 5
concurrency cases and 9 browser journeys.

---

## The browser journeys

```
✓ a provider proposes, the client accepts, and the requirement is filled   1.2m
✓ a client can decline a proposal, and the requirement stays open          53.9s
✓ accepting one proposal declines the competition                          1.0m
✓ a second proposal on the same requirement is refused                     33.9s
✓ withdrawing is final — the provider cannot propose again                 36.9s
✓ a withdrawn proposal stays visible to the client, marked                 38.6s
✓ a provider cannot open another provider's proposal                       38.9s
✓ a cancelled requirement refuses a proposal                               31.4s
✓ a filled requirement refuses a second proposal                           1.0m
```

The first is the one `module5.md` names as the core workflow, and it now
runs end to end with no mock data anywhere in the path: a client publishes a
requirement, a provider submits a proposal against it, the client accepts,
and the requirement moves to `FILLED` — each state read back from the
database through the UI rather than asserted from the screen that just wrote
it.

`accepting one proposal declines the competition` is the one worth keeping
even though it is slow. It checks the half of the acceptance transaction the
client never sees: the losing provider's own screen must stop saying they
are awaiting a decision.

---

## What is deliberately not tested in the browser

- **Concurrency.** Playwright cannot reliably fire two simultaneous
  acceptances, and a race test that quietly runs sequentially passes while
  proving nothing. Those five cases run against the real database instead —
  `apps/api/src/proposals/tests/acceptance.integration-spec.ts`.
- **A client reading another client's proposal.** `App.tsx` gates `/client/*`
  to clients, and the fixtures create one client — who owns the requirement,
  making the attempt legitimate. Adding a second client purely to drive the
  router to a 403 would test routing rather than the rule. The rule is
  covered where it is enforced: `getProposalOnOwnJob` in
  `proposals.service.spec.ts`, and the 403 in `proposals.e2e.spec.ts`.

---

## Things the first run found

Five of the nine journeys failed on the first attempt. None was a product
bug, and the difference mattered enough to chase rather than paper over.

**1. The 60-second per-test default was too short.**

Timing the API standalone showed the hosted database answering in one to
four seconds per call. The hiring journey needs a five-step wizard, two
signed-in browser contexts, a submission, an acceptance and three
verification page loads — comfortably past the budget. The failures
presented as `element(s) not found`, which reads exactly like a broken page.

Raised to 180 seconds for this file only, with the reasoning in a comment so
the next person does not "fix" it back.

**2. A dead branch in `SubmitProposalPage`.**

The page had a "this requirement is no longer accepting proposals" banner
for cancelled and filled requirements. It could never render: the form reads
the _public_ requirement route, which stops returning either state
altogether. Removed, and the tests now assert what actually happens — a
`Requirement not found` empty state, deliberately indistinguishable from a
requirement that never existed.

**3. A strict-mode locator violation.**

`getByText(/requirement not found/i)` matched twice, because the empty
state's heading and its description both say it — the description is filled
with the API's own 404 message. Switched to `getByRole('heading')`.

The API was ruled out directly rather than by inference: with the server
running standalone, every call after an acceptance returned 200 in under
four seconds (`GET /jobs/me/:id`, `GET /proposals/:id`, `GET /jobs`), which
is what separated "slow test harness" from "hung server".

---

## Test data

Every account is created by `e2e/global-setup.ts` with an `e2e-<timestamp>`
prefix and deleted in teardown; requirements, proposals and connections
cascade from the users. Verified afterwards: **0** `e2e-` users, **0**
proposals, **0** connections left behind.

The concurrency suite uses its own `m5-concurrency-` prefix and deletes
everything in `afterAll`, including on failure. Also verified clean.

Pre-existing residue from Module 04 — two `module4-*` accounts and three
requirements — is untouched and still recorded in `module4-e2e-results.md`.

---

## Known gaps, unchanged by this run

1. **Attachment uploads are still unverified.** `STORAGE_*` is unset, so no
   file has ever been uploaded. The authorisation around proposal
   attachments is tested; the upload path itself has only run against mocks.
   The attach UI on the proposal detail screen is therefore untested in the
   browser.
2. **Rate limiting is in-memory.** Inherited. `POST /proposals` is a genuine
   abuse surface — one provider can spam every open requirement — and the
   throttler works on one instance and silently stops working on two.
3. **Public discovery still has no door.** `GET /jobs` is public by design,
   but `App.tsx` gates `/provider/*` to vendors, so a signed-out visitor
   cannot reach the requirement board. Recorded in Module 04 and unchanged.
