# Module 02 — Profiles

## Status

Phase 1 (MVP)

---

# Purpose

The Profiles module is responsible for managing a user's professional identity on the marketplace.

It enables providers to showcase their expertise while helping clients evaluate potential service providers.

The module separates authentication concerns from professional and public-facing information.

---

# Goals

- Create and manage professional profiles
- Showcase provider expertise
- Store reusable professional information
- Build marketplace trust and credibility
- Support public provider profiles
- Provide searchable professional metadata

---

# Non Goals

The following features are intentionally excluded from Phase 1.

- Authentication
- Authorization
- Job Management
- Proposals
- Contracts
- Messaging
- Payments
- Review Management
- AI Profile Optimization
- Resume Parsing
- LinkedIn Import
- GitHub Import

---

# Responsibilities

The module is responsible for:

- Profile Management
- Public Profiles
- Portfolio Management
- Skills
- Experience
- Education
- Certifications
- Languages
- Social Links
- Availability
- Profile Completion
- Profile Verification Status
- Professional Statistics

The module is NOT responsible for:

- Authentication
- Authorization
- Jobs
- Proposals
- Contracts
- Messaging
- Payments
- Reviews

---

# Actors

Guest

Authenticated User

Client

Provider

Administrator

---

# User Stories

### Guest

- View Public Profile

### Authenticated User

- Edit Profile
- Upload Portfolio
- Add Skills
- Add Experience
- Add Education
- Add Certifications
- Manage Languages
- Update Availability

### Client

- View Provider Profiles
- Browse Provider Portfolios

### Provider

- Manage Professional Profile
- Publish Portfolio
- Control Profile Visibility

### Administrator

- Moderate Public Profiles (future)

---

# Business Rules

- Every user has exactly one Profile.
- Every Profile belongs to exactly one User.
- Portfolio items belong to one Profile.
- Portfolio items may contain multiple images.
- Skills must reference predefined Skills.
- Experience entries are independent.
- Education entries are independent.
- Certifications are optional.
- Languages include proficiency level.
- Profile visibility is controlled by the owner.
- Deleted portfolio items must not affect completed contracts.
- Profile completion is calculated dynamically.
- Professional statistics are system generated.
- Verification status is managed by the system.

---

# Database Design

## Tables

### Profile

Purpose

Stores public and professional profile information.

Contains

- Display Name
- Headline
- Bio
- Avatar
- Location
- Timezone
- Social Links
- Visibility
- Availability
- Verification Status

Relationships

- Belongs to one User.
- Has many Portfolio Items.
- Has many Experiences.
- Has many Education Records.
- Has many Certifications.
- Has many User Skills.
- Has many User Languages.
- Has one Profile Statistics.

---

### Portfolio

Purpose

Stores professional work showcased by providers.

Contains

- Title
- Description
- Category
- Cover Image
- Project Date
- Visibility

Relationships

- Belongs to one Profile.
- Has many Portfolio Images.

---

### PortfolioImage

Purpose

Stores portfolio media.

Relationships

- Belongs to one Portfolio.

---

### Experience

Purpose

Stores professional work experience.

Contains

- Company
- Position
- Description
- Start Date
- End Date
- Currently Working

Relationships

- Belongs to one Profile.

---

### Education

Purpose

Stores educational qualifications.

Relationships

- Belongs to one Profile.

---

### Certification

Purpose

Stores professional certifications.

Relationships

- Belongs to one Profile.

---

### Skill

Purpose

Stores predefined platform skills.

Examples

- Java
- React
- Photography
- Wedding Planning
- Video Editing

Relationships

- Has many User Skills.

---

### UserSkill

Purpose

Maps Profiles to Skills.

Relationships

- Belongs to one Profile.
- Belongs to one Skill.

---

### UserLanguage

Purpose

Stores languages spoken by a user.

Contains

- Language
- Proficiency

Relationships

- Belongs to one Profile.

---

### ProfileStatistics

Purpose

Stores marketplace-generated profile statistics.

Contains

- Completed Projects
- Jobs In Progress
- Average Rating
- Total Reviews
- Member Since
- Response Rate
- Response Time

Relationships

- Belongs to one Profile.

---

# ER Diagram

User

└── Profile

  ├── Portfolio

  │  └── PortfolioImage

  ├── Experience

  ├── Education

  ├── Certification

  ├── UserSkill

  │  └── Skill

  ├── UserLanguage

  └── ProfileStatistics

---

# Prisma Requirements

Generate Prisma schema for:

- Profile
- Portfolio
- PortfolioImage
- Experience
- Education
- Certification
- Skill
- UserSkill
- UserLanguage
- ProfileStatistics

Requirements

- UUID primary keys
- Foreign Keys
- createdAt
- updatedAt
- Soft Delete where appropriate
- Proper indexes
- Proper constraints
- Unique User → Profile relationship
- Composite unique constraints where appropriate

---

# API Endpoints

Profiles

GET /profiles/me

PATCH /profiles/me

GET /profiles/:id

GET /u/:username

Portfolio

POST /portfolio

PATCH /portfolio/:id

DELETE /portfolio/:id

Experience

POST /experience

PATCH /experience/:id

DELETE /experience/:id

Education

POST /education

PATCH /education/:id

DELETE /education/:id

Certification

POST /certification

PATCH /certification/:id

DELETE /certification/:id

Skills

POST /skills

DELETE /skills/:id

Languages

POST /languages

DELETE /languages/:id

Availability

PATCH /availability

---

# Request Validation

Profile

- Display Name required
- Headline maximum length
- Bio maximum length
- Valid Location

Portfolio

- Title required
- Description required
- At least one image

Experience

- Company required
- Position required
- Valid Dates

Education

- Institution required
- Degree required

Certification

- Name required
- Issuing Organization required

Skills

- Must reference predefined Skill

Languages

- Language required
- Proficiency required

---

# Profile Flow

Profile Creation

User

↓

Create Empty Profile

↓

Complete Basic Information

↓

Add Skills

↓

Add Experience

↓

Upload Portfolio

↓

Publish Profile

---

Portfolio Upload

Provider

↓

Create Portfolio Item

↓

Upload Images

↓

Save

↓

Visible on Public Profile

---

Availability Update

Provider

↓

Update Availability

↓

Save

↓

Marketplace reflects latest status

---

# Security

- Authenticated access required for profile editing
- Public profiles are read-only
- Ownership validation
- Input validation
- File upload validation
- Secure media storage
- SQL Injection Protection
- XSS Protection

---

# Folder Structure

profiles/

controllers/

services/

repositories/

dto/

entities/

validators/

tests/

---

# Dependency Matrix

| Module      | Depends On    | Used By                       |
| ----------- | ------------- | ----------------------------- |
| Identity    | User          | Marketplace, Jobs, Reviews    |
| Marketplace | Reads Profile | Displays provider information |
| Jobs        | Reads Profile | Displays provider details     |
| Contracts   | Reads Profile | Participant information       |
| Reviews     | Reads Profile | Displays ratings              |

---

# Module Events

Published Events

- ProfileCreated
- ProfileUpdated
- PortfolioAdded
- PortfolioUpdated
- AvailabilityUpdated

Consumed By

- Marketplace
- Search
- Notifications

---

# Implementation Order

1. Database Design
2. Prisma Schema
3. Migration
4. Repository
5. Service
6. Controller
7. Validation
8. Portfolio
9. Skills
10. Experience
11. Education
12. Certifications
13. Availability
14. Public Profile
15. Testing
16. Documentation

---

# Test Cases

Profile

- Create Profile
- Update Profile
- Public Visibility

Portfolio

- Add Portfolio
- Update Portfolio
- Delete Portfolio

Skills

- Add Skill
- Remove Skill

Experience

- Add Experience
- Update Experience
- Delete Experience

Availability

- Update Status
- Visibility Changes

---

# Deliverables

The implementation must include:

✓ PostgreSQL Schema

✓ Prisma Schema

✓ Database Migration

✓ Repository Layer

✓ Service Layer

✓ Controller Layer

✓ DTO Validation

✓ Public Profile APIs

✓ Portfolio Management

✓ Skills Management

✓ Experience Management

✓ Education Management

✓ Certifications Management

✓ Availability Management

✓ Unit Tests

✓ API Documentation

---

# Future Enhancements

Deferred until future phases.

- Resume Parsing
- AI Profile Optimization
- LinkedIn Import
- GitHub Import
- Portfolio Analytics
- Video Introductions
- Verification Badges
- Advanced Search Ranking

---

# Acceptance Criteria

The module is considered complete when:

- Every user has exactly one Profile.
- Users can edit their professional profile.
- Providers can manage portfolios.
- Skills are reusable across the platform.
- Experience and education are manageable.
- Public profiles are viewable.
- Availability is configurable.
- Professional statistics are displayed.
- Prisma migrations succeed.
- All unit tests pass.
- APIs are documented.

---

# Implementation Instructions for Codex

Implement this module following the architecture and documentation.

Requirements:

- Use NestJS.
- Use Prisma ORM.
- Use PostgreSQL.
- Follow layered architecture.
- Keep controllers thin.
- Place all business logic inside services.
- Use repositories for database access.
- Validate all inputs.
- Write clean, modular, production-ready code.
- Generate Prisma migrations.
- Write unit tests.
- Keep code well documented.

Do not implement any feature listed under "Future Enhancements".

If implementing in stages:

Stage 1 → Database + Prisma

Stage 2 → Repository + Services

Stage 3 → Controllers + DTOs

Stage 4 → Public Profile + Portfolio

Stage 5 → Testing

Stage 6 → Documentation
