-- Module 5 — Connection completion semantics.
--
-- Purely additive: one new enum, two new nullable/defaulted columns, one new
-- index. Safe to run against the populated database — every existing
-- connections row gets status='ACTIVE', completedAt=NULL, which is correct:
-- none of them have been confirmed complete yet.

-- CreateEnum
CREATE TYPE "ConnectionStatus" AS ENUM ('ACTIVE', 'COMPLETED');

-- AlterTable
ALTER TABLE "connections" ADD COLUMN "status" "ConnectionStatus" NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "connections" ADD COLUMN "completedAt" TIMESTAMP(3);

-- CreateIndex
-- Serves the auto-complete sweep: every ACTIVE row, cheaply.
CREATE INDEX "connections_status_idx" ON "connections"("status");
