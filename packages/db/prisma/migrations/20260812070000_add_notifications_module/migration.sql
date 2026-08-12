-- Module 6 — Notifications.
--
-- Purely additive: one new enum, one new table, no existing column touched.
-- Safe to run against the populated database.
--
-- Cascade on recipientUserId (unlike Media's owner, which is deliberately
-- not a cascade): nothing else references a notification row once its
-- recipient is gone, so there is no reason to keep it around.

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('PROPOSAL_SUBMITTED', 'PROPOSAL_WITHDRAWN', 'PROPOSAL_ACCEPTED', 'PROPOSAL_REJECTED', 'CONNECTION_ESTABLISHED', 'JOB_CANCELLED');

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "recipientUserId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "data" JSONB,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- Serves the notification list, newest first, for one recipient.
CREATE INDEX "notifications_recipientUserId_createdAt_idx" ON "notifications"("recipientUserId", "createdAt");

-- CreateIndex
-- Serves the unread-count query.
CREATE INDEX "notifications_recipientUserId_readAt_idx" ON "notifications"("recipientUserId", "readAt");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
