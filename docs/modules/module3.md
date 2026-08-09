# Module 03 — Marketplace

## Status

Phase 1 (MVP)

> Merged spec. Structure and framing follow the authored Module 3 plan;
> the sections marked **[Decision]** record where that plan was reconciled
> against `phase_scope1.2.0.md`, `domain_rules.md`, `CLAUDE.md`, and the
> code that already exists in `apps/api/src/profiles`.

---

# Purpose

The Marketplace module is the discovery layer of Marché.

It helps users find, search, filter, and evaluate service providers and
their offerings. It consumes professional information from the Profiles
module and presents it in a searchable marketplace, without becoming the
source of truth for provider identity or professional data.

---

# Goals

- Enable users to discover service providers
- Enable users to search for services and providers
- Provide category-based discovery
- Provide skill-based discovery
- Support location-based discovery
- Provide filtering and sorting
- Support marketplace pagination
- Support provider availability signals
- Support marketplace visibility
- Provide a foundation for search and ranking

---

# Non Goals

- Authentication, Authorization, Profile Management, Portfolio Management
- Jobs, Proposals, Contracts, Messaging, Payments, Reviews, Bookings
- AI Recommendations / Advanced Recommendation Engine
- Advanced Search Ranking, Semantic Search, Behavioral Ranking
- Sponsored Listings, Advertising, Featured or Boosted Providers
- Location radius / geographic distance search
- Saved Searches, Saved Providers, Recently Viewed
- **[Decision]** Service Images — see "Known Gaps"
- **[Decision]** Service slugs — services stay UUID-addressed. Slugs need
  generation, collision suffixes, and a rename policy, for no Phase 1
  benefit while there is no SEO surface.
- **[Decision]** Service Packages (tiered pricing) — a single starting
  price per service. `database1.2.0.md` records ServicePackage as deferred.

---

# Responsibilities

The module is responsible for:

- Provider Discovery
- Service Discovery
- Search, Filters, Sorting, Pagination
- Categories (hierarchical)
- Service Skills / Tags
- Location-based Discovery
- Availability Filtering
- Marketplace Visibility
- Basic deterministic marketplace ranking

The module is NOT responsible for:

- Authentication, Authorization
- Profile or Portfolio Management
- Jobs, Proposals, Contracts, Messaging, Payments, Reviews
- Provider Identity

---

# Actors

Guest, Authenticated User, Client, Provider, Administrator

---

# User Stories

### Guest

- Browse Marketplace
- Search for Providers and Services
- Browse Categories
- Filter and Sort Results
- View Public Provider Profiles

### Client

- Discover Service Providers
- Find Providers by Category, Skill, or Location
- Filter by Availability and Price
- Compare Provider Results

### Provider

- Create and Manage Services
- Control Service Visibility
- Appear in Marketplace

### Administrator

- Manage Marketplace Categories

---

# Business Rules

- Only users with role `PROVIDER` may create Services.
- Every Service belongs to exactly one Profile and one Category.
- Marketplace never creates or modifies Profile information.
- Provider information in results comes from the Profiles module.
- Search results must respect Profile visibility.
- Disabled, suspended, soft-deleted, or `PRIVATE` profiles must not appear
  in public marketplace results.
- Skills used for filtering must reference predefined `Skill` rows.
- Categories must reference predefined marketplace Categories.
- Marketplace results must have deterministic sorting.
- Providers must not appear more than once in a provider result set.
- Availability filters use the provider's current availability state.
- Location filtering uses the location stored by the Profiles module.
- Deleted or hidden Services must not appear in public results.
- Public marketplace APIs expose only discovery-safe information.
- Marketplace must tolerate unavailable downstream statistics (ratings,
  review counts) without failing discovery.

---

# Database Design

## Tables

### Category

Purpose

Predefined, hierarchical service categories used for discovery.

Contains

- Name
- Slug
- Description
- Icon
- Parent Category (nullable, self-referencing)
- Status
- Display Order

Relationships

- May belong to one parent Category.
- May have many child Categories.
- Has many Services.

**[Decision]** Hierarchy is **two levels deep by convention** — a parent
and its children, as in the Photography/Design/Development example. The
column is a generic self-referencing `parentId`, so deeper nesting is
structurally possible, but queries and validation assume two levels.
Enforcing "a child may not itself have children" keeps every category
query a single join instead of a recursive CTE.

---

### Service

Purpose

A discoverable service offering from a provider.

Contains

- Provider Profile ID
- Category ID
- Title
- Description
- Starting Price
- Delivery Time (days)
- Status
- Visibility
- Tags — **[New]** free-text, provider-authored

Relationships

- Belongs to one Profile.
- Belongs to one Category.
- Has many ServiceSkills.

**[Decision]** No `location` column. The authored plan listed Location on
both `Service` and (via its own business rule) the Profile, which is two
sources of truth for one fact. Profile wins — the rule "location filtering
must use the location stored by the Profiles module" is the correct one,
and providers realistically operate from one place.

---

### ServiceSkill

Purpose

Maps Services to predefined platform Skills, enabling skill-based
discovery.

Relationships

- Belongs to one Service.
- Belongs to one Skill.

Notes

`Skill` is owned by the Profiles domain (Module 2) and is referenced by
relation here, never duplicated.

---

### Tags (a column on Service, not a table) **[New]**

Purpose

Lets a provider describe work the seeded `Skill` taxonomy doesn't cover
("balloon artistry", "sri lankan cuisine") without a dead end.

**[Decision]** Two mechanisms deliberately, with different jobs:

|                         | `ServiceSkill` (seeded) | `tags` (free text) |
| ----------------------- | ----------------------- | ------------------ |
| Who defines the values  | Platform, seeded        | The provider       |
| Powers filters / facets | **Yes**                 | **Never**          |
| Searched by `q`         | Yes                     | Yes                |
| Displayed on the card   | Yes                     | Yes                |

The reason skills are seeded at all is that filtering only works when
everyone uses the same label — free text produces "Photography",
"photography", "Photograpy", and a category filter that finds a third of
the people who match. Tags stay out of filters for exactly that reason,
so they can never degrade discovery. They are a **keyword-search and
display** surface only.

Stored as a `String[]` column on `Service`. No join table: tags are not
shared entities, nothing references them, and nothing needs to enumerate
them. A table would buy nothing and cost a join.

---

### MarketplaceSearch

Not a table. Represents the search criteria DTO: query, category, skills,
location, price bounds, availability, sort, page, limit. Not persisted in
Phase 1.

---

# ER Diagram

Profile

└── Service

├── Category

│ └── Parent Category

└── ServiceSkill

    └── Skill

---

# Prisma Requirements

Generate Prisma schema for marketplace-owned entities only:

- Category
- Service
- ServiceSkill

Requirements

- UUID primary keys
- Foreign keys to Profile, Category, Skill
- `createdAt`, `updatedAt`
- Soft delete (`deletedAt`) on Service and Category
- Unique constraint on `Category.slug`
- Composite unique on `(serviceId, skillId)` in ServiceSkill
- `ServiceStatus` enum (`DRAFT` / `PUBLISHED` / `UNPUBLISHED`)
- `tags String[]` on Service — free text, no join table **[New]**
- Indexes on `Service.profileId`, `Service.categoryId`, `Service.status`,
  `Category.parentId`
- Composite index supporting the default browse query
  (status + createdAt)

Do not duplicate Profile, Skill, or User tables. Reference them by
relation.

---

# API Endpoints

**[Decision]** The authored plan had three pairs of duplicate routes
(`/marketplace` vs `/marketplace/search`, `/marketplace/categories` vs
`/categories`, `/marketplace/providers/:id` vs Module 2's existing
`/profiles/:id`). Each is collapsed to one canonical path below. Two
endpoints doing the same thing is two places for the visibility filter to
be wrong.

Discovery — public

GET /services — search, filter, sort, paginate (browse with no params)

GET /services/:id

GET /marketplace/providers — deduplicated provider discovery

Categories — public

GET /categories — full tree

GET /categories/:slug

Categories — admin

POST /categories

PATCH /categories/:id

DELETE /categories/:id

Services — owner

POST /services

PATCH /services/:id

DELETE /services/:id

GET /services/me

PATCH /services/:id/visibility

Provider profile detail is served by Module 2's existing `GET /profiles/:id`
and `GET /u/:username`. Skills are served by Module 2. Neither is
re-exposed here.

---

# Provider Discovery

`GET /marketplace/providers` returns providers, not listings.

- Accepts the same filter params as `GET /services`.
- A provider matches if **any** of their published services match.
- Results are deduplicated per provider (`DISTINCT ON` provider), so a
  provider with eight matching services appears once.
- Each result carries the provider's cheapest matching service as the
  "starting price" signal.
- Built on the same repository query path and the same shared visibility
  filter as `GET /services`.

---

# Search, Filters, Sorting

## Parameters

| Param          | Behaviour                                                |
| -------------- | -------------------------------------------------------- |
| `q`            | Substring on title/description; whole-tag match on tags  |
| `category`     | Category slug; matches the category **and its children** |
| `skills`       | Comma-separated skill IDs; service must match all        |
| `location`     | Substring match against `Profile.location`               |
| `minPrice`     | Inclusive lower bound                                    |
| `maxPrice`     | Inclusive upper bound                                    |
| `availability` | Matches `Profile.availabilityStatus`                     |
| `sort`         | See below                                                |
| `page`         | Positive integer, default 1                              |
| `limit`        | Default and maximum enforced                             |

**[Corrected — verified in implementation]** `q` matches **substrings** of
title and description, but **whole tags only**. Prisma's `String[]`
filters compare complete elements and offer no substring operator or
`mode: 'insensitive'`, so `q=balloon` does not surface the tag
`balloon artistry`. Tags are normalised to lowercase on write, which is
what makes the tag arm case-insensitive at all.

True substring matching on tags would require a raw
`EXISTS (SELECT 1 FROM unnest(tags) t WHERE t ILIKE ...)` fragment, which
this spec rules out of the search path. Accepted rather than worked
around: tags are an escape hatch for work the seeded Skill list doesn't
cover, not a primary search surface, and title and description still match
on substring. Revisit if tag search turns out to matter in practice.

## Sorting

**[Decision]** Three sorts ship. Two are rejected with a 400 until the
Reviews module exists.

| Value        | Phase 1 status                               |
| ------------ | -------------------------------------------- |
| `newest`     | Supported — **default**                      |
| `price_low`  | Supported                                    |
| `price_high` | Supported                                    |
| `rating`     | **Rejected, 400** — no review data exists    |
| `relevance`  | **Rejected, 400** — no ranking signal exists |

Rationale: rating is `null` for every provider in Phase 1, so both options
would silently return an arbitrary order while implying ranking. A clear
400 keeps the API contract honest and gives the frontend an unambiguous
signal about which sorts to render. The authored plan's default was
`relevance`; the default is `newest` until relevance is real.

Every sort applies `id` as a final tiebreaker. Without it Postgres may
return different orders for the same page across requests, and items can
duplicate or vanish while paginating.

## Visibility filter

One shared repository method applies, on every public read path:

- `Service.status = PUBLISHED`
- `Service.deletedAt IS NULL`
- `Profile.visibility = PUBLIC`
- `Profile.deletedAt IS NULL`
- `User.status = ACTIVE` and `User.deletedAt IS NULL`

This exists in exactly one place so there is exactly one place it can be
forgotten.

---

# Pagination

All marketplace list APIs return:

```text
{
  data: [],
  pagination: {
    page,
    limit,
    total,
    totalPages,
    hasNext,
    hasPrevious
  }
}
```

Reuses the existing `PaginationQueryDto` from `profiles/dto` for input.

---

# Request Validation

Search

- `q` maximum length
- Category slug must exist
- Skill IDs must exist
- Price bounds non-negative; `minPrice` must not exceed `maxPrice`
- `availability` restricted to the `AvailabilityStatus` enum
- `sort` restricted to the three supported values
- `page` positive; `limit` capped

Category

- Name required
- Slug required, unique, slug-formatted
- Parent category must exist and must itself be top-level

Service

- Title required, max length
- Description required, max length
- Category required and must exist
- Starting price required, non-negative, sane upper bound
- Delivery time required, positive integer
- Visibility and status restricted to their enums
- Skills must reference existing `Skill` rows
- Tags: optional; capped count per service; capped length each; trimmed;
  empty and duplicate entries dropped rather than rejected **[New]**

---

# Security

- Public marketplace APIs expose only discovery-safe fields.
- Authenticated access required for all service management.
- `PROVIDER` role required to create a service.
- `ADMIN` role required for category mutations.
- Ownership validated on every service edit, delete, and visibility change.
- Parameterised queries only — no interpolated SQL in the search path.
- Input validation at every boundary.
- XSS protection (descriptions stored as-is, escaped at render).
- Rate limiting on search endpoints via the existing global throttler.

## Mass Assignment / Field-Level Authorization

- DTOs must use explicit allowlisted fields; never bind request bodies
  directly to Prisma models.
- Provider-controlled requests must not be able to set `profileId`,
  server-controlled `status`, verification fields, ownership fields,
  timestamps, or internal ranking fields.

What this protects against concretely: a provider sending

```json
{ "title": "...", "profileId": "someone-else", "status": "PUBLISHED" }
```

and having those fields accepted merely because they exist on the Prisma
model.

Implementation requirements:

1. **Server-controlled fields win by construction.** When building a Prisma
   payload from a DTO, server-set fields must be written **after** the
   spread, never before:

   ```ts
   // Correct — server value cannot be overridden
   create({ ...dto, profileId: profile.id });

   // Wrong — a profileId on the DTO silently wins
   create({ profileId: profile.id, ...dto });
   ```

   **[Note]** The second form currently exists in Module 2
   (`certification.service.ts`, `education.service.ts`). It is not
   exploitable today, because those DTOs don't declare `profileId` and the
   global pipe strips unknown fields — but it is one DTO edit away from
   becoming a real ownership-transfer bug. Module 3 must not copy that
   ordering.

2. **Status is never settable through the create or update DTO.** It moves
   only through the dedicated `PATCH /services/:id/visibility` endpoint, so
   there is one audited path for a state change rather than two.

3. **Separate create and update DTOs.** An update DTO must not be a blanket
   `Partial<CreateDto>` if that would widen what is writable; anything
   server-owned is absent from both.

4. **The global `ValidationPipe` is a backstop, not the control.**
   `main.ts` already runs `whitelist: true` + `forbidNonWhitelisted: true`,
   which rejects unknown properties with a 400. That is defence in depth —
   the DTO shape is still the actual authorization boundary, because the
   pipe cannot know that a field the DTO _does_ declare is one the caller
   shouldn't be allowed to set.

**[Decision]** Role checks live in the **service layer**, matching
`profiles/profile-access.util.ts` (`assertProviderRole`). No `RolesGuard`
is introduced — the repository has no roles guard today, and `CLAUDE.md`
requires reusing the existing pattern over inventing a better one. An
`assertAdminRole` follows the same shape.

---

# Folder Structure

marketplace/

controllers/

services/

repositories/

dto/

tests/

**[Decision]** Matches `apps/api/src/profiles` exactly. The authored plan
also listed `entities/`, `validators/`, and `strategies/`. Prisma types
serve as entities and `class-validator` decorators live on the DTOs (so
the first two are empty by construction), and `strategies/` is the
strategy pattern, which `CLAUDE.md` explicitly forbids introducing.

---

# Dependency Matrix

| Module      | Depends On                   | Used By                  |
| ----------- | ---------------------------- | ------------------------ |
| Identity    | User, JWT guard              | Auth + role checks       |
| Profiles    | Profile, Skill, Availability | Discovery data           |
| Marketplace | Identity, Profiles           | Jobs, Proposals, Reviews |

---

# Module Events

Documented for future design only. **Nothing is implemented in Phase 1.**

Intended events: `ServiceCreated`, `ServiceUpdated`, `ServiceDeleted`,
`ServiceVisibilityChanged`, `CategoryCreated`, `CategoryUpdated`,
`CategoryDeleted`.

**[Decision]** There is no event bus in this repository, and `CLAUDE.md`
lists event buses among the abstractions not to introduce. Module 2's spec
carried the same section and shipped none. This section is a forward
record of intent, not a deliverable.

---

# Implementation Order

1. Review existing Profile / Skill schema
2. Prisma schema + migration
3. Category seed (hierarchical fixture)
4. Category management (admin)
5. Service repository
6. Service management (owner)
7. Marketplace repository + shared visibility filter
8. Search, filtering, sorting, pagination
9. Provider discovery (deduplicated)
10. Marketplace visibility
11. Unit tests
12. Swagger documentation
13. `status.md` entry

---

# Test Cases

Marketplace

- Browse with no filters
- Search by query
- Filter by category (including child-category rollup)
- Filter by skill
- Filter by location
- Filter by price range
- Filter by availability
- Sort by each supported value
- `sort=rating` and `sort=relevance` → 400
- Inverted price range → 400
- Paginate; page beyond last returns empty data with correct metadata
- Deterministic order across repeated identical requests

Categories

- Create, update, delete as admin
- Create as non-admin → 403
- Create child category
- Child of a child → rejected
- Duplicate slug → rejected

Services

- Create as provider
- Create as client → 403
- Update own service
- Update another provider's service → 403
- Change visibility
- Soft delete

Tags

- Create a service with tags → searchable by tag keyword
- Duplicate and whitespace-only tags → silently cleaned, not rejected
- Exceed tag count or length cap → rejected
- Tag value is not accepted as a filter param
- Tag containing markup → stored escaped, no XSS on render

Mass assignment / field-level authorization

- Create with `profileId` in the body → field rejected, service is owned by the caller
- Update with `profileId` in the body → ownership unchanged
- Create or update with `status` in the body → field rejected, status unchanged
- Create with `createdAt` / `updatedAt` / `deletedAt` in the body → rejected
- Create with an unknown field → 400 from the global pipe
- Update another provider's service by passing its `id` in the body → 403/404, no write

Visibility (the critical set)

- Unpublished service absent from public results
- Soft-deleted service absent
- Service of a `PRIVATE` profile absent
- Service of a suspended or soft-deleted user absent
- Provider result set contains no duplicate providers

---

# Deliverables

✓ Prisma Schema, Migration, Category Seed

✓ Repository, Service, Controller layers

✓ DTO Validation

✓ Category Management (admin)

✓ Service Management (provider)

✓ Marketplace Search, Filtering, Sorting, Pagination

✓ Provider Discovery

✓ Marketplace Visibility

✓ Unit Tests

✓ API Documentation

---

# Future Enhancements

AI Recommendations, Personalized Marketplace, ML Search Ranking, Semantic
Search, Location Radius Search, Sponsored/Featured/Boosted Providers,
Search Analytics, Behavioral Ranking, Saved Searches, Saved Providers,
Recently Viewed Providers.

---

# Acceptance Criteria

- Users can browse, search, filter, and sort marketplace services.
- Users can search by category, skill, and location.
- Category filtering rolls up child categories.
- Results paginate with complete metadata.
- Sorting is deterministic and repeatable.
- Unsupported sorts are rejected, not silently faked.
- Providers can create and manage their own services.
- Providers can control service visibility.
- Non-owners cannot modify a service they don't own.
- Only admins can mutate categories.
- Hidden, deleted, and private content never appears publicly.
- Provider results contain no duplicates.
- Marketplace does not duplicate Profile or Skill ownership.
- Prisma migrations succeed.
- All unit tests pass.
- APIs are documented in Swagger.

---

# Known Gaps / Pending UI Changes

Deliberate Phase 1 limitations.

- **Service Images are not implemented.** `phase_scope1.1.0.md` listed
  "Service Images" under Phase 1 Marketplace; `phase_scope1.2.0.md` moves
  it to Excluded to match what this module actually builds. Provider and
  service cards use the Profile avatar and portfolio previews owned by
  Module 2 instead. Rationale: image handling is still pasted-URL-only (no
  upload pipeline, no file validation), and adding a third URL-string
  image table would mean migrating three tables when real uploads land
  instead of two. **This is a deferral, not a cancellation — revisit when
  object storage (R2) is wired up, alongside Portfolio uploads.**

- **Advanced search ranking is not implemented.** Ranking is deterministic
  ordering, not relevance scoring. `sort=relevance` is rejected rather
  than aliased, so nothing implies ranking that doesn't exist.

- **Ratings and review counts are unavailable.** The Reviews module does
  not exist. Provider cards must not display a rating or review count in
  Phase 1, and `sort=rating` is rejected. Same reasoning as the deferred
  profile statistics in `module2.md`.

- **Location matching is free-text substring, not geographic.**
  `Profile.location` is an unnormalised string, so "Bangalore",
  "Bengaluru", and "Bangalore, India" do not match each other. Radius
  search and location normalisation are both deferred. The UI should
  present location as a loose filter, not a precise one.

- **The pagination envelope differs from the Profiles module.** Marketplace
  returns `{ data, pagination: { page, limit, total, totalPages, hasNext,
hasPrevious } }` as specified above; Profiles returns
  `{ items, total, page, limit }`. Two shapes in one API is poor DX, and
  the intended fix is to migrate Profiles onto this richer envelope — but
  that is a breaking change to endpoints that are already shipped and
  wired into the frontend, so it is deliberately not done as a side effect
  of Module 3. Tracked here so the inconsistency is a known debt rather
  than an accident.

- **Marketplace loading / empty / error states are frontend concerns.**
  The backend contributes a correct empty `data` array with valid
  pagination metadata; presentation belongs to the UI integration pass.
