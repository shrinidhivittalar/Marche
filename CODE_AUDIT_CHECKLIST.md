# Code audit checklist

Audited 2026-08-10 against `chore/full-audit` (= `main` + the Module 5 UI
fixes + the security fixes), by five parallel agents covering: API
identity/media, API profiles/marketplace, API jobs/proposals, web
state/client screens, web provider screens + packages.

This file is the source of truth for the engagement. Items are checked off
only after the fix is verified — each `[x]` carries what was wrong, what the
fix was, and how it was proved.

**Not findings** (known, deliberate, recorded elsewhere): in-memory
throttler storage; unset `STORAGE_*`; no upload content-safety scanning;
Contracts/Messages/Finances/Stats/`VendorProfilePage` still on mock data
because those modules do not exist; `currentUser.rating || 4.98`.

**Withdrawn during triage**: a claim that `profiles.controller.ts:47` was
`@Get('u:username')` (missing slash) — it is `@Get('u/:username')`, the
agent misread it, and a live request to `/u/:username` returned 200/404
correctly during the security audit.

---

## Broken — wrong behaviour, a crash, or a silent no-op

- [x] `apps/api/src/profiles/dto/add-skill.dto.ts:33` — `@Validate(SkillIdOrName)` sits on `skillId`, which also carries `@IsOptional()`; class-validator skips *every* validator on an absent property, so the cross-field rule never fires and `POST /skills` with `{}` passes validation. ✅ **Fixed** — `@Validate` moved onto an always-defined carrier property, so class-validator can never skip it. Verified live: `POST /skills {}` → 400.
- [x] `apps/api/src/profiles/services/skills.service.ts:60` — consequence of the above: an empty body calls `resolveTypedSkill(undefined)`, and `skills.repository.ts:19` builds `where: { name: { equals: undefined } }`, which Prisma drops — `findFirst` returns an arbitrary skill and silently attaches a random one to the caller's profile. ✅ **Fixed** — `resolveTypedSkill` rejects a blank name, and `findSkillByName` returns null without querying rather than building a match-anything `where`. Verified live: 0 skills attached by the bad requests.
- [x] `apps/api/src/profiles/repositories/profiles.repository.ts:107` — `withDetails` filters portfolio items by `deletedAt` only, ignoring `Portfolio.visibility`, so an item explicitly set to `PRIVATE` is still returned in the public profile view; the setting is a no-op. ✅ **Fixed** — `withDetails(profileId, viewerIsOwner)`, required param so a forgetful caller is a type error. Verified live: public view showed only the PUBLIC piece, owner saw both.
- [x] `apps/api/src/profiles/services/experience.service.ts:64` — `endDate` can never be cleared (`dto.endDate ? new Date(...) : undefined`, and the DTO accepts no null), so an entry that once had an end date can never be re-marked `currentlyWorking` — it 400s forever with no request that fixes it. ✅ **Fixed** — explicit `null` clears, matching the `avatarMediaId` convention already in the repo. Verified live: PATCH `{endDate:null,currentlyWorking:true}` → 200, stored null.
- [x] `apps/api/src/marketplace/dto/search-services.dto.ts:70` — `skills` validated as `@IsString({ each: true })` where `service.dto.ts:71` correctly uses `@IsUUID`, so `GET /services?skills=abc` reaches Prisma with a non-uuid against a uuid column and 500s instead of 400ing. ✅ **Fixed** — `@IsUUID(undefined,{each:true})`, matching the sibling DTO. Verified live: `?skills=abc` → 400, was 500.
- [x] `apps/web/src/context/AppContext.tsx:306` — the access token is refreshed once on mount and nothing retries on 401, so after 15 minutes every `useApiResource` screen shows a permanent error until the user reloads. ✅ **Fixed** — proactive renewal on a 14-minute timer keyed on the token; the existing shared in-flight promise in `lib/api.ts` already collapses concurrent refreshes, so nothing new was added. A failed refresh clears the token and routes to sign-in, and because the timer is keyed on the token it does not reschedule — no retry loop.
- [x] `apps/web/src/pages/client/CreateJobPage.tsx:134` — resuming a draft never calls `jobsApi.attachments`, so files already on that draft vanish from the editor and the summary reports "None" while they still exist server-side. ✅ **Fixed** — a second `useApiResource` loads the draft's attachments and seeds them once per draft, carrying `attachmentId` so removing a server-loaded file actually issues the DELETE rather than only dropping it locally.
- [x] `apps/web/src/pages/provider/ProviderHomePage.tsx:44` — the provider home feed reads mock `jobs` from AppContext (used at `:76`, `:94`, `:100`, `:245`) while every other provider screen is on the real Jobs API. ✅ **Fixed** — feed now on `jobsApi.search` with real loading/error/empty states and real categories in the filter. Verified live in a browser: the feed showed a requirement the client had just published, which a mock feed could not know. Screenshot inspected.
- [x] `apps/web/src/pages/provider/ProviderHomePage.tsx:387` — "View Full Details" navigates to `/provider/jobs/<mockId>`, which hits the real `GET /jobs/:id`; a mock id never resolves, so the feed's primary CTA always lands on "Requirement not found". ✅ **Fixed** — the CTA now carries a real API id. Verified live: landed on `/provider/jobs/de768426-…`, no "not found", zero console errors.
- [x] `apps/api/src/identity/controllers/auth.controller.ts:79` — the refresh cookie is `sameSite: 'strict'` while the frontend is a separate origin in production (`render.yaml:52`, CORS `credentials: true`); a browser will not send it cross-site, so `/auth/refresh` fails for every real user off localhost. ✅ **Fixed** — `refreshCookieOptions()`: production gets `sameSite:'none'` + `secure`, dev keeps `strict`. Unit-tested both branches; the SameSite leg of CSRF is traded for the path-scope + bearer-token defences, argued in the comment.

- [x] `apps/api/src/profiles/services/education.service.ts` + `dto/education.dto.ts` — **found during batch 1**, not in the original audit: the same "optional date can never be cleared" defect as `experience.service.ts`, unfixed because it was outside that agent's assigned files. ✅ **Fixed** — same explicit-`null`-clears convention as the experience fix, covering both optional fields (`fieldOfStudy`, `graduationYear`).

## Wrongly wired — connected to the wrong thing

- [x] `apps/api/src/jobs/services/jobs.service.ts:314` — a non-owner's access to a requirement's attachments is gated on `findPublicById` (requires `PUBLISHED`), so the moment their proposal is accepted and the job flips to `FILLED`, the *hired* provider loses access to the brief. ✅ **Fixed** — `listAttachments` now falls back to `findHiredProviderProfileId` when the public filter excludes the job, so the hired provider keeps access. Verified: `npm run typecheck` clean, dedicated unit tests in `jobs.service.spec.ts` (hired provider allowed, unrelated provider still 403) pass.
- [x] `apps/api/src/profiles/controllers/profiles.controller.ts:49` — `getByUsername` passes no viewer id, so `readableProfileWhere`'s owner escape hatch is unreachable on `/u/:username` and a suspended owner 404s on their own public page. ✅ **Fixed** — new `OptionalJwtAuthGuard` forwards a viewer id when present without 401ing anonymous readers. Verified live: owner read of `/u/:username` returned their own profile.
- [x] `apps/web/src/pages/client/ProposalDetailPage.tsx:163` — links to `/profile/${username ?? id}`, but that route resolves via `GET /profiles/:id`; any provider who has set a username 404s. ✅ **Fixed** — always navigates with `provider.id`, matching every other link into `PublicProfilePage`. Verified: `npm run typecheck`/`lint` clean.
- [x] `apps/web/src/pages/client/SearchTalentPage.tsx:515` — rows come from mock `talentProfiles` but navigate to `/profile/:id`, which resolves against the real API, so every result lands on "Profile not found". ✅ **Fixed** — page deleted; `/client/search` now renders the real `BrowseServicesPage`, whose provider cards carry real profile ids. Verified: `npm run typecheck`/`lint` clean, no remaining references.
- [x] `apps/web/src/pages/client/ClientOnboardingPage.tsx:14` — onboarding saves through the mock `updateCurrentUser` (localStorage) while `ClientDashboard.tsx:61` judges completeness from the real `/profiles/me`, so finishing onboarding never clears the card. ✅ **Fixed** — `handleContinue` now also calls `profilesApi.updateMe` with the headline, with an inline error state that keeps the user on the page if the save fails. Verified: `npm run typecheck`/`lint` clean; live browser verification not run this pass (signup is email-verification gated in this environment).
- [x] `apps/web/src/pages/provider/ProviderOnboardingPage.tsx:363` — same defect on the provider side: `handleFinish` writes to localStorage only, so the "Your profile is incomplete" banner never clears. ✅ **Fixed** — `handleFinish` now also calls `profilesApi.updateMe` with headline + bio (the two wizard fields the profile actually stores), with the same inline save-error handling as the client page. The in-flight edit had left the file non-compiling (missing `accessToken`, `saving`/`saveError` state, an undefined `location` reference with no wizard input behind it) — completed it and dropped `location` since nothing in this wizard collects it. Verified: `npm run typecheck`/`lint` clean.
- [x] `apps/web/src/App.tsx:117` — `/marketplace` (the real, API-backed browse screen) is linked from nowhere; the client "Search" tab points at the mock `SearchTalentPage`. ✅ **Fixed** — `/client/search` now routes to `BrowseServicesPage`. Verified: `npm run typecheck`/`lint` clean.

## Misplaced — logic in the wrong layer

- [x] `apps/web/src/pages/provider/ProviderOnboardingPage.tsx:143` — a 10% `MARCHE_FEE_RATE` invented in a component and shown as a deduction at `:986`, contradicting `MyWorkPage.tsx:168` ("0% vendor commission") and the reasoning `SubmitProposalPage.tsx:31` gives for deleting the fee breakdown. ✅ **Fixed** — `MARCHE_FEE_RATE`, `serviceFee`, and the "Service fee"/"You'll get" rows removed; only the hourly rate itself is shown, matching `SubmitProposalPage`. Verified: `npm run typecheck`/`lint` clean.
- [x] `apps/web/src/context/AppContext.tsx:529` — `updateCurrentUser` does `localStorage` I/O inside the `setCurrentUser` updater, a side effect in a function React double-invokes under StrictMode. ✅ **Fixed** — the localStorage read/merge/write moved out of the `setCurrentUser` updater into the function body, so it runs once per call rather than twice under StrictMode.

## Could be better — real but non-critical

- [x] `apps/web/src/pages/provider/SubmitProposalPage.tsx:96` — `priceValid` enforces only `>= 0` while the DTO caps at 10,000,000 with 2 decimals, so the button stays enabled for a value the server will reject. ✅ **Fixed** — added the `MAX_PRICE` cap and a 2-decimal-place regex check, matching `@Max(10000000)` / `@IsNumber({ maxDecimalPlaces: 2 })` on `CreateProposalDto`. Verified: `npm run typecheck`/`lint` clean.
- [x] `packages/ui/src/components/Combobox.tsx:66` — `canCreate` tests only the passed `options`, and `ProfileApiSection.tsx:110` already filters out skills the provider holds, so retyping one they already have offers "Add as new" and gets a 409. ✅ **Fixed** — new optional `existingLabels` prop that `canCreate` also checks; `SkillsCard` passes the profile's current skill names. Verified: `npm run typecheck`/`lint` clean; live browser verification not run (only callers are behind signup email verification in this environment — see note below).
- [x] `packages/ui/src/components/Combobox.tsx:111` — Enter-to-create is the only keyboard path; there is no arrow-key/Enter way to pick an existing option (CLAUDE.md §3 accessibility). ✅ **Fixed** — added `activeIndex` state and a combined `navItems` list (create action + filtered options); ArrowUp/ArrowDown move the highlight, Enter commits whichever is active, mouse hover keeps the highlight in sync. Verified: `npm run typecheck`/`lint` clean; live browser verification not run this pass (same auth gate as above).
- [x] `apps/api/src/proposals/services/proposals.service.ts:159` — `accept` returns the unselected `Connection` row, so the response does not match the `CONNECTION_FIELDS` shape its Swagger text and the web `ApiConnection` type both describe. ✅ **Fixed** — `ConnectionsRepository.create` now passes `select: CONNECTION_FIELDS`. Verified: `npm run typecheck` clean, full `proposals.e2e.spec.ts` (which exercises `accept`) passes.
- [x] `apps/api/src/proposals/services/proposals.service.ts:314` — `job.deletedAt !== null` is unreachable; the only caller's job comes from `findById`, which already filters it. ✅ **Fixed** — check removed with a comment explaining why; the corresponding "409s on a soft-deleted requirement" unit test (which could only pass by mocking an impossible state) was removed too. Verified: `proposals.service.spec.ts` passes.
- [x] `apps/api/src/proposals/services/proposals.service.ts:344` — `getOwnProfile` is byte-identical in three services (`connections.service.ts:63`, `jobs.service.ts:393`). ✅ **Fixed** — pulled into `getOwnProfileOrThrow` in `profile-access.util.ts`, alongside the existing `assertProviderRole`/`assertClientRole`/`assertOwnership` helpers; all three services now delegate to it. Verified: `npm run typecheck` clean, full API test suite (510 tests) passes.
- [x] `apps/api/src/proposals/services/proposals.service.ts:376` — `getOwnJob` re-implements `JobsService.getOwnJob` even though `JobsService` is already injected here. ✅ **Fixed** — `JobsService.getOwnJob` made public (was private), `ProposalsService.getOwnJob` now delegates to it. Verified: `proposals.service.spec.ts` passes (its `jobsService` mock updated to mirror the same ownership check via the test's own `profiles`/`jobs` mocks).
- [x] `apps/api/src/media/media.service.ts:190` — `status` is optional in `signViewUrl`'s parameter type, so a caller that omits it silently skips the "only UPLOADED" guard the method exists to apply. ✅ **Fixed** — `status` made required in the parameter type; confirmed every caller's Prisma `select` already includes it. Verified: `npm run typecheck` clean, `media.service.spec.ts` passes.
- [x] `apps/api/src/media/media.service.ts:215` — the docstring says it "removes rows"; the loop marks them `FAILED` and removes nothing. ✅ **Fixed** — docstring rewritten to describe what the loop actually does. Verified: comment-only change, `media.service.spec.ts` passes.
- [x] `apps/api/src/identity/services/users.service.ts:14` — hand-copies `toPublicUser`'s field mapping instead of reusing it, so two `PublicUser` shapes must be kept in sync by hand. ✅ **Fixed** — `toPublicUser` exported from `auth.service.ts`, `UsersService.getById` now calls it. Verified: `npm run typecheck` clean, `users.service.spec.ts` passes.
- [x] `apps/api/src/profiles/repositories/profiles.repository.ts:39` — the ~14-line nested `include` block is duplicated verbatim with `:106`. ✅ **Fixed** — pulled into a `nestedCollectionsInclude(portfolioWhere)` helper both `findByUserIdWithDetails` and `withDetails` now call, parameterized on the one thing that differs (the portfolio visibility filter). Verified: `npm run typecheck` clean, `profiles.repository.spec.ts` passes.
- [x] `apps/api/src/profiles/services/certification.service.ts:19` — spreads `...dto` into the repository where `services.service.ts:41` deliberately enumerates fields; `education.service.ts:19` does the same. ✅ **Fixed** — both now enumerate fields explicitly, matching `ServicesService.create`. Verified: `npm run typecheck` clean, `certification.service.spec.ts`/`education.service.spec.ts` pass.
- [ ] `apps/web/src/pages/client/ClientDashboard.tsx:109` — "Active Projects"/"Completed Projects" filter mock `contracts` by a backend user id, so both tiles are structurally always 0 beside two real ones. **Not fixed — flagged instead.** This is the same root cause as the "Not findings" note above (Contracts has no real backend, so `contracts` is still the mock fixture keyed on fake ids like `user_client_1`, which can never equal the real backend `currentUser.id`). The *entire* Contracts tab has this same problem, not just these two tiles — the audit happened to flag only the summary tiles. A real fix means either building a Contracts API (out of scope) or fabricating a mapping between mock rows and real users (would misrepresent real state, not actually fix anything). Leaving unscheduled pending a product decision on Contracts.
- [x] `apps/web/src/pages/client/JobDetailPage.tsx:200` — hardcoded `bg-white` on deliverable and attachment rows, which stay white in dark mode. ✅ **Fixed** — changed to `bg-surface`, the theme-aware background used elsewhere on the page. Verified: `npm run typecheck`/`lint` clean.
- [x] `apps/web/src/lib/formatTime.ts:18` — `formatTimeRange` is exported but used only inside its own file. ✅ **Fixed** — dropped the `export`; confirmed no other file imports it. Verified: `npm run typecheck`/`lint` clean.
- [x] `apps/web/src/pages/provider/SearchJobsPage.tsx:200` — renders only top-level categories, so child categories are unfilterable, unlike `BrowseServicesPage` which renders both from the same endpoint. ✅ **Fixed** — each parent's `children` now render as indented checkboxes beneath it, same data `BrowseServicesPage` already gets from `marketplaceApi.categories()`. Verified: `npm run typecheck`/`lint` clean; live browser verification not run this pass (provider search requires a signed-in session — same auth gate as above).
- [x] `apps/web/src/pages/provider/JobDetailProviderView.tsx:247` — comment says the CTA "still points at the mock proposal screen until it exists"; Module 5 shipped and it is on the real API. ✅ **Fixed** — stale comment removed. Verified: comment-only change, `npm run typecheck`/`lint` clean.
- [x] `apps/api/src/jobs/services/jobs.service.ts:250` — `MAX_ATTACHMENTS` declared mid-class where `ProposalsService` puts the same constant at the top. ✅ **Fixed** — moved to the top of the class, matching `ProposalsService`. Verified: `npm run typecheck` clean, `jobs.service.spec.ts` passes.
- [ ] `docs/architecture1.3.0.md:287`, `docs/dataflow1.3.0.md:676`, `docs/modules/module5.md:1035` — all still name `JobsService.markFilled`, which no longer exists.

## Should be removed — genuinely dead code

- [ ] `apps/web/src/hooks/useJobFacets.ts` — **found during batch 2**: its only consumer was the provider home feed, which no longer uses it.

- [ ] `apps/web/src/lib/formatFile.ts:1` — `formatFileSize` has zero references anywhere.
- [ ] `apps/web/src/pages/client/ClientDashboard.tsx:136` — a `// Handlers` comment block describing handlers deleted earlier today; nothing follows it.
- [ ] `apps/api/src/marketplace/services/services.service.ts:81` — `void profile;` suppressing an unused binding no caller wants.
- [ ] `apps/api/src/media/media.config.ts:8` — `IMAGE_MIME_TYPES`, `DOCUMENT_MIME_TYPES`, `isImage` are exported but referenced nowhere outside the file.
- [ ] `packages/db/prisma/schema.prisma:46` — `@@index([email])` duplicates the unique index Postgres creates for `email @unique`.
- [ ] `packages/db/prisma/schema.prisma:206` — `@@index([username])` duplicates the unique index for `username @unique`.
- [ ] `packages/ui/src/components/` — `Avatar`, `Container`, `IconTile`, `RatingStars`, `SectionHeading`, `Separator`, `Sheet` have no importers anywhere.

---

## Flagged, not scheduled — scope decisions for the user

These came out of the audit but are redesigns or product calls, not fixes:

- `apps/api/src/main.ts:25` — no `/api/v1` prefix, no global exception filter, no response envelope, against CLAUDE.md §3. Whole-app breaking change touching every route and every frontend call; not a fix, a migration.
- `packages/db/prisma/schema.prisma:176` — `socialLinks` is accepted and stored but never returned or read by any screen. Either surface it or drop it; both are product decisions.
- `apps/web/src/lib/api.ts:17` vs `api-fetch.ts:15` — two `apiFetch` definitions with slightly divergent error extraction. The split is deliberate (identity vs domain), but the error handling could be shared.

---

## Counts

| Bucket | Count |
| --- | --- |
| Broken | 11 (10 audited + 1 found while fixing) — 11 fixed |
| Wrongly wired | 7 — 7 fixed |
| Misplaced | 2 — 2 fixed |
| Could be better | 19 — 18 fixed, 1 flagged (ClientDashboard.tsx:109, same root cause as Contracts-is-mock) |
| Should be removed | 7 |
| **Total scheduled** | **46** |
| Flagged, not scheduled | 3 (+ 1 above) |
