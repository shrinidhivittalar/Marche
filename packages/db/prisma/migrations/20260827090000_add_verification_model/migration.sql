-- Module 01 Slice 5 — verification model
-- (production-refactor/module1-implementation-contract.md §8).
--
-- Additive only, zero-downtime: no column dropped, no row deleted.
-- User.emailVerifiedAt is untouched and remains the fast-path read column
-- for the login hot path (§8.2) — this table becomes the write-side system
-- of record going forward; existing verified users are backfilled below so
-- the two never disagree for a pre-existing row.
--
-- Applied and verified against TEST_DATABASE_URL only; the hosted
-- production DATABASE_URL is not touched by this migration file directly —
-- it is applied only via the standard `db:deploy` step, same as every
-- other migration in this repository.

-- CreateEnum
CREATE TYPE "VerificationType" AS ENUM ('EMAIL', 'PHONE', 'IDENTITY', 'PROVIDER', 'CREDENTIAL', 'BUSINESS');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED', 'EXPIRED');

-- CreateTable
CREATE TABLE "verifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "VerificationType" NOT NULL,
    "status" "VerificationStatus" NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "verifications_userId_type_key" ON "verifications"("userId", "type");

-- CreateIndex
CREATE INDEX "verifications_userId_idx" ON "verifications"("userId");

-- AddForeignKey
ALTER TABLE "verifications" ADD CONSTRAINT "verifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Data backfill — deterministic, lossless: every user already verified
-- under the old (sole) column gets the matching ledger row, so
-- Verification agrees with User.emailVerifiedAt for every existing row
-- from the moment this migration completes.
INSERT INTO "verifications" ("id", "userId", "type", "status", "verifiedAt", "createdAt")
SELECT gen_random_uuid(), "id", 'EMAIL', 'VERIFIED', "emailVerifiedAt", "emailVerifiedAt"
FROM "users"
WHERE "emailVerifiedAt" IS NOT NULL;
