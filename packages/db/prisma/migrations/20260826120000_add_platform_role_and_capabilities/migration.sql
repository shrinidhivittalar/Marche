-- Module 01 identity refactor — expand phase (Slice 1: database foundation).
-- Additive only: no column is dropped, no row is deleted, User.role is left
-- fully intact and untouched. Safe to run against production data with zero
-- downtime — every new column has a default, every new table starts empty
-- and is backfilled deterministically from existing data below.
--
-- Rollback: dropping platformRole, user_capabilities, and the two new enum
-- types reverses this migration with no data loss beyond the (recreatable
-- from User.role) capability/platform-role rows themselves, since role is
-- still present and authoritative on every existing row. See
-- production-refactor/module1-migration-plan.md §2.2 for the full
-- expand/migrate/contract sequencing this migration is step 1 of.

-- CreateEnum
CREATE TYPE "PlatformRole" AS ENUM ('USER', 'ADMIN', 'SUPER_ADMIN');

-- CreateEnum
CREATE TYPE "Capability" AS ENUM ('CLIENT', 'PROVIDER');

-- AlterTable
-- DEFAULT 'USER' means every existing row is valid the instant this column
-- exists — no separate backfill needed for the CLIENT/PROVIDER case (see the
-- ADMIN backfill below for the one value that needs correcting).
ALTER TABLE "users" ADD COLUMN "platformRole" "PlatformRole" NOT NULL DEFAULT 'USER';

-- CreateTable
CREATE TABLE "user_capabilities" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "capability" "Capability" NOT NULL,
    "activatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_capabilities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_capabilities_userId_capability_key" ON "user_capabilities"("userId", "capability");

-- CreateIndex
CREATE INDEX "user_capabilities_userId_idx" ON "user_capabilities"("userId");

-- AddForeignKey
ALTER TABLE "user_capabilities" ADD CONSTRAINT "user_capabilities_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Data backfill — deterministic, lossless, per
-- production-refactor/module1-migration-plan.md §2.2:
--   User.role = 'CLIENT'   -> platformRole stays 'USER' (already set by the
--                             column default above) + one CLIENT capability row
--   User.role = 'PROVIDER' -> platformRole stays 'USER' + one PROVIDER capability row
--   User.role = 'ADMIN'    -> platformRole becomes 'ADMIN', no capability row
--                             (current production data shows no admin account
--                             has ever posted a job or a service under the
--                             existing single-role model, so none is inferred)

-- Existing admins: correct the platformRole the column default got wrong for
-- this one case.
UPDATE "users" SET "platformRole" = 'ADMIN' WHERE "role" = 'ADMIN';

-- Existing clients: one CLIENT capability row each.
INSERT INTO "user_capabilities" ("id", "userId", "capability", "activatedAt", "createdAt")
SELECT gen_random_uuid(), "id", 'CLIENT', "createdAt", "createdAt"
FROM "users"
WHERE "role" = 'CLIENT';

-- Existing providers: one PROVIDER capability row each.
INSERT INTO "user_capabilities" ("id", "userId", "capability", "activatedAt", "createdAt")
SELECT gen_random_uuid(), "id", 'PROVIDER', "createdAt", "createdAt"
FROM "users"
WHERE "role" = 'PROVIDER';
