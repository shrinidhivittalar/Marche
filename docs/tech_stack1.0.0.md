# Technology Stack

## Purpose

This document defines the technology stack used throughout the Marché platform.

Rather than simply listing technologies, this document explains the purpose of each technology, why it was selected, where it fits into the system architecture, and whether it is part of the current implementation or planned for future phases.

The guiding principle is to choose technologies that maximize maintainability, scalability, developer productivity, and long-term flexibility without introducing unnecessary complexity into the MVP.

---

# Technology Selection Principles

The technology stack has been chosen using the following principles:

- Use mature, battle-tested technologies.
- Prefer simplicity over unnecessary complexity.
- Keep the MVP lightweight.
- Design for future scalability without prematurely implementing it.
- Favor strong TypeScript support.
- Prefer technologies with excellent documentation and community support.
- Keep vendor lock-in to a minimum whenever practical.

---

# Frontend

| Technology | Status | Purpose | Why We Chose It |
|------------|---------|---------|-----------------|
| React | Current | UI Library | Industry standard for building scalable component-based interfaces. |
| TypeScript | Current | Type Safety | Reduces runtime bugs through static type checking. |
| Vite | Current | Build Tool | Extremely fast development server and optimized production builds. |
| React Router | Current | Routing | Standard client-side routing solution for React applications. |
| TanStack Query | Current | Server State | Efficient server state management, caching and synchronization. |
| Axios | Current | HTTP Client | Simplifies API communication with interceptors and error handling. |
| React Hook Form | Current | Forms | High-performance form management with minimal re-renders. |
| Zod | Current | Validation | Type-safe schema validation shared between frontend and backend. |
| Tailwind CSS / Styled Components | Current | Styling | Consistent, maintainable UI styling system (choose one). |
| Framer Motion | Planned | Animations | Smooth UI interactions without excessive complexity. |
| React Hot Toast | Current | Notifications | Lightweight user feedback system. |

---

# Backend

| Technology | Status | Purpose | Why We Chose It |
|------------|---------|---------|-----------------|
| Node.js | Current | Runtime | Fast, event-driven runtime ideal for API servers. |
| NestJS | Current | Backend Framework | Modular architecture, dependency injection and excellent TypeScript support. |
| TypeScript | Current | Language | End-to-end type safety across the application. |

---

# Database

| Technology | Status | Purpose | Why We Chose It |
|------------|---------|---------|-----------------|
| PostgreSQL | Current | Relational Database | Excellent support for relational data, transactions, indexing and scalability. |
| Prisma | Current | ORM | Type-safe database access, migrations and schema management. |
| Prisma Studio | Current | Database Management | Simple visual interface for inspecting and editing development data. |

---

# Authentication & Security

| Technology | Status | Purpose | Why We Chose It |
|------------|---------|---------|-----------------|
| JWT | Current | Authentication | Stateless authentication for secure API access. |
| Refresh Tokens | Current | Session Management | Maintain secure long-lived sessions. |
| Argon2 *(or bcrypt)* | Current | Password Hashing | Secure password hashing using industry best practices. |
| Passport.js | Current | Authentication Middleware | Simplifies authentication strategies in NestJS. |
| Google OAuth | Planned | Social Login | Reduce registration friction. |
| LinkedIn OAuth | Planned | Social Login | Useful for professional profiles. |
| MFA | Future | Additional Security | Improve account protection. |

---

# File Storage

| Technology | Status | Purpose | Why We Chose It |
|------------|---------|---------|-----------------|
| Cloudflare R2 | Current | Object Storage | S3-compatible storage without egress fees. |
| Amazon S3 | Future Option | Object Storage | Easy migration path for AWS-based infrastructure. |
| Cloudflare CDN | Current | Content Delivery | Faster global delivery of uploaded assets. |

Stores:

- Profile Images
- Portfolio Images
- Service Images
- Chat Attachments
- Documents

---

# Search

| Technology | Status | Purpose | Why We Chose It |
|------------|---------|---------|-----------------|
| PostgreSQL Full Text Search | Current | Search | Sufficient for MVP while avoiding additional infrastructure. |
| OpenSearch | Future | Advanced Search | High-performance search and filtering for large datasets. |

---

# Caching

| Technology | Status | Purpose | Why We Chose It |
|------------|---------|---------|-----------------|
| Redis | Planned | Cache | Improve performance and reduce database load. |

Future Uses

- Session caching
- Frequently accessed data
- Rate limiting
- Background jobs

---

# Real-Time Communication

| Technology | Status | Purpose | Why We Chose It |
|------------|---------|---------|-----------------|
| Socket.IO | Planned | WebSockets | Enables real-time messaging and live notifications. |

---

# Background Processing

| Technology | Status | Purpose | Why We Chose It |
|------------|---------|---------|-----------------|
| BullMQ | Planned | Job Queue | Reliable background processing built on Redis. |

Examples

- Email Sending
- Notification Delivery
- Image Processing
- Scheduled Tasks

---

# Payments

| Technology | Status | Purpose | Why We Chose It |
|------------|---------|---------|-----------------|
| Razorpay | Planned | Payment Gateway | Best fit for Indian payment ecosystem. |
| Stripe | Future | International Payments | Enables global payment support if required. |

---

# Email

| Technology | Status | Purpose | Why We Chose It |
|------------|---------|---------|-----------------|
| Resend | Planned | Transactional Emails | Modern API with excellent developer experience. |
| AWS SES | Future Option | Transactional Emails | Scalable alternative for AWS infrastructure. |

---

# Development Tools

| Technology | Status | Purpose | Why We Chose It |
|------------|---------|---------|-----------------|
| Git | Current | Version Control | Industry-standard distributed version control. |
| GitHub | Current | Source Code Hosting | Repository hosting and collaboration. |
| GitHub Projects | Current | Project Management | Sprint and issue tracking. |
| VS Code | Current | IDE | Rich ecosystem and TypeScript support. |
| Postman | Current | API Testing | API development and debugging. |
| Docker | Current | Containerization | Consistent development and deployment environments. |
| pgAdmin | Current | PostgreSQL Management | Database administration and debugging. |
| TablePlus | Optional | Database Client | Lightweight alternative database management tool. |

---

# Code Quality

| Technology | Status | Purpose | Why We Chose It |
|------------|---------|---------|-----------------|
| ESLint | Current | Static Analysis | Detects code quality issues before runtime. |
| Prettier | Current | Code Formatting | Ensures a consistent code style across the project. |
| Husky | Current | Git Hooks | Automatically runs quality checks before commits and pushes. |
| lint-staged | Current | Staged File Checks | Runs checks only on modified files for faster commits. |

Husky Workflow

Pre-Commit

- ESLint
- Prettier
- Type Checking
- lint-staged

Pre-Push

- Full Test Suite
- Build Verification

---

# Testing

| Technology | Status | Purpose | Why We Chose It |
|------------|---------|---------|-----------------|
| Jest | Current | Unit Testing | Fast and reliable testing framework with TypeScript support. |
| Supertest | Current | API Testing | Integration testing for REST APIs. |
| React Testing Library | Current | Component Testing | Tests UI from the user's perspective. |
| Playwright | Planned | End-to-End Testing | Automates complete user workflows. |

---

# API Documentation

| Technology | Status | Purpose | Why We Chose It |
|------------|---------|---------|-----------------|
| Swagger (OpenAPI) | Current | API Documentation | Automatically generates interactive API documentation. |

---

# Monitoring & Logging

| Technology | Status | Purpose | Why We Chose It |
|------------|---------|---------|-----------------|
| Pino | Current | Logging | Fast structured logging for Node.js applications. |
| Sentry | Planned | Error Monitoring | Real-time production error tracking. |
| Grafana | Future | Monitoring | Infrastructure and application monitoring. |
| Prometheus | Future | Metrics | Collects application performance metrics. |

---

# Analytics

| Technology | Status | Purpose | Why We Chose It |
|------------|---------|---------|-----------------|
| Google Analytics | Planned | Product Analytics | Understand user behaviour and traffic. |
| Microsoft Clarity | Planned | Session Recording | Identify UX issues through heatmaps and recordings. |
| PostHog | Future | Product Analytics | Self-hosted analytics alternative. |

---

# Design & Documentation

| Technology | Status | Purpose | Why We Chose It |
|------------|---------|---------|-----------------|
| Figma | Current | UI/UX Design | Design system and interface design. |
| Eraser | Current | Architecture Diagrams | System architecture and technical documentation. |
| Mermaid | Current | Diagram as Code | Version-controlled diagrams inside documentation. |
| dbdiagram.io | Current | Database Design | ER diagram creation and schema visualization. |
| Markdown | Current | Documentation | Lightweight, version-controlled documentation. |

---

# Future Considerations

The architecture has intentionally been designed to support future adoption of:

- OpenSearch
- Redis
- BullMQ
- Socket.IO
- Organizations
- Action-Based Permissions
- Multi-Tenancy
- White-Labelling
- AI Integrations
- Microservices (only if justified by scale)