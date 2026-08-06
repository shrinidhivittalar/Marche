# Module 01 — Identity

## Status

Phase 1 (MVP)

---
# Purpose

The Identity module is responsible for authentication and account lifecycle management.

It is the foundation of every authenticated feature in the platform.

---

# Goals

- Register new users
- Authenticate users
- Manage login sessions
- Verify user email
- Reset forgotten passwords
- Secure user credentials
- Provide authenticated access to the platform

---

# Non Goals

The following features are intentionally excluded from Phase 1.

- Multi-tenancy
- White-label login
- Organizations
- Team workspaces
- Action-based permissions (RBAC)
- OAuth (Google, LinkedIn, Apple)
- MFA
- SSO
- Phone verification

---

# Responsibilities

The module is responsible for:

- User Registration
- Login
- Logout
- Session Management
- Password Hashing
- Email Verification
- Password Reset

The module is NOT responsible for:

- Authorization
- Organizations
- Payments
- Profiles
- Marketplace

---

# Actors

Guest

Authenticated User

Administrator

---

# User Stories

### Guest

- Register
- Verify Email
- Login
- Reset Password

### Authenticated User

- Logout
- View Current User

### Administrator

- Suspend User (future)

---

# Business Rules

- Email must be unique.
- Passwords are never stored in plain text.
- Passwords must be hashed using Argon2.
- Every user has exactly one account.
- Email verification is required.
- Suspended users cannot login.
- Deleted users are soft deleted.
- JWT is used for authentication.
- Refresh Tokens maintain login sessions.

---

# Database Design

## Tables

### User

Purpose

Stores all registered users.

Contains

- Basic Profile
- Authentication Information
- Account Status
- Verification Status

Relationships

- One User has many Sessions.
- One User has many Verification Tokens.
- One User has many Password Reset Tokens.

---

### Session

Purpose

Stores authenticated login sessions.

Contains

- Refresh Token
- Device Information
- IP Address
- Expiration

Relationships

- Belongs to one User.

---

### VerificationToken

Purpose

Stores temporary email verification tokens.

Relationships

- Belongs to one User.

---

### PasswordReset

Purpose

Stores password reset requests.

Relationships

- Belongs to one User.

---

# ER Diagram

User

├── Session

├── VerificationToken

└── PasswordReset

---

# Prisma Requirements

Generate Prisma schema for:

- User
- Session
- VerificationToken
- PasswordReset

Requirements

- UUID primary keys
- Foreign Keys
- createdAt
- updatedAt
- Soft Delete where appropriate
- Proper indexes
- Proper constraints

---

# API Endpoints

Authentication

POST /auth/register

POST /auth/login

POST /auth/logout

POST /auth/refresh

POST /auth/forgot-password

POST /auth/reset-password

GET /auth/verify-email

Users

GET /users/me

---

# Request Validation

Registration

- Email required
- Email valid
- Password required
- Password minimum length
- Password confirmation
- Name required

Login

- Email
- Password

Forgot Password

- Email

Reset Password

- Token
- New Password

---

# Authentication Flow

Registration

User

↓

Validate Input

↓

Hash Password

↓

Create User

↓

Generate Verification Token

↓

Send Email

↓

Success

---

Login

User

↓

Validate Credentials

↓

Generate JWT

↓

Create Session

↓

Return Access Token

↓

Return Refresh Token

---

Password Reset

Forgot Password

↓

Generate Reset Token

↓

Email User

↓

Validate Token

↓

Update Password

↓

Delete Reset Token

---

# Security

- Argon2 Password Hashing
- JWT Authentication
- Refresh Tokens
- HTTPS Only
- Secure Cookies (if applicable)
- Rate Limiting
- Input Validation
- SQL Injection Protection
- XSS Protection

---

# Folder Structure

identity/

controllers/

services/

repositories/

dto/

entities/

validators/

guards/

strategies/

tests/

---

# Implementation Order

1. Database Design
2. Prisma Schema
3. Migration
4. Repository
5. Service
6. Controller
7. Validation
8. JWT
9. Email Verification
10. Password Reset
11. Testing
12. Documentation

---

# Test Cases

Registration

- Successful Registration
- Duplicate Email
- Invalid Email
- Weak Password

Login

- Successful Login
- Invalid Password
- User Not Found
- Suspended User

Password Reset

- Valid Token
- Invalid Token
- Expired Token

Sessions

- Login
- Logout
- Refresh Token
- Multiple Devices

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

✓ JWT Authentication

✓ Email Verification

✓ Password Reset

✓ Unit Tests

✓ API Documentation

---

# Future Enhancements

Deferred until future phases.

- OAuth
- MFA
- Organizations
- RBAC
- SSO
- Phone Verification
- Multi-tenancy

---

# Acceptance Criteria

The module is considered complete when:

- A user can register.
- A verification token is generated.
- A user can verify their email.
- A user can login.
- JWT authentication works.
- Refresh tokens work.
- Password reset works.
- Sessions are persisted.
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

Stage 4 → Authentication

Stage 5 → Testing

Stage 6 → Documentation