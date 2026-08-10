-- Module 4 — Jobs (Requirements).
--
-- Purely additive: one new enum, one new table, no existing column touched.
-- Nothing to back-fill and nothing to lose, so this is safe to run against
-- a populated database.
--
-- Three fields module4.md asks for are deliberately absent, each argued in
-- schema.prisma above the model:
--
--   visibility  — DRAFT already means private, and a published-but-hidden
--                 job has no audience in Phase 1
--   deadline    — one date until a second one has a distinct meaning
--   PROPOSAL_ACTIVITY — derivable by counting proposals in Module 5

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'FILLED', 'CANCELLED');

-- CreateTable
CREATE TABLE "jobs" (
    "id" TEXT NOT NULL,
    "clientProfileId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "budgetMin" DECIMAL(10,2),
    "budgetMax" DECIMAL(10,2),
    "location" TEXT,
    "eventDate" TIMESTAMP(3),
    "status" "JobStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "jobs_clientProfileId_idx" ON "jobs"("clientProfileId");

-- CreateIndex
CREATE INDEX "jobs_categoryId_idx" ON "jobs"("categoryId");

-- CreateIndex
-- Serves provider discovery: published jobs, newest first.
CREATE INDEX "jobs_status_publishedAt_idx" ON "jobs"("status", "publishedAt");

-- CreateIndex
-- Serves the event_date sort and date filtering.
CREATE INDEX "jobs_eventDate_idx" ON "jobs"("eventDate");

-- AddForeignKey
-- Cascade: a deleted profile takes its own requirements with it.
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_clientProfileId_fkey" FOREIGN KEY ("clientProfileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
-- Restrict: deleting a category that still has jobs must fail loudly
-- rather than cascade away clients' requirements.
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
