-- Referrals — a client inviting someone they trust to join as a provider.
--
-- Purely additive: one new enum, one new table, no existing column touched.
-- Safe to run against the populated database.

-- CreateEnum
CREATE TYPE "ReferralStatus" AS ENUM ('INVITED', 'JOINED');

-- CreateTable
CREATE TABLE "referrals" (
    "id" TEXT NOT NULL,
    "referrerProfileId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "specialty" TEXT NOT NULL,
    "note" TEXT,
    "status" "ReferralStatus" NOT NULL DEFAULT 'INVITED',
    "joinedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "referrals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- One invite per (referrer, email) — resending is re-clicking, not a
-- second row. Different clients may still both refer the same address.
CREATE UNIQUE INDEX "referrals_referrerProfileId_email_key" ON "referrals"("referrerProfileId", "email");

-- CreateIndex
CREATE INDEX "referrals_referrerProfileId_idx" ON "referrals"("referrerProfileId");

-- CreateIndex
CREATE INDEX "referrals_email_status_idx" ON "referrals"("email", "status");

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referrerProfileId_fkey" FOREIGN KEY ("referrerProfileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
