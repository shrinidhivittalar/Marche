-- Module 01 Slice 7 — Google OAuth + account linking
-- (production-refactor/module1-implementation-contract.md §7).
--
-- Additive only, zero-downtime: no column dropped, no row deleted.
-- Applied and verified against TEST_DATABASE_URL only; the hosted
-- production DATABASE_URL is not touched by this migration file directly —
-- it is applied only via the standard `db:deploy` step, same as every
-- other migration in this repository.

-- CreateEnum
CREATE TYPE "AuthProvider" AS ENUM ('EMAIL_PASSWORD', 'GOOGLE');

-- CreateTable
CREATE TABLE "authentication_methods" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "AuthProvider" NOT NULL,
    "providerAccountId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "authentication_methods_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- NULLs are distinct from each other in a Postgres unique index, so this
-- does not collide across the many EMAIL_PASSWORD rows the backfill below
-- creates (all with providerAccountId = NULL) — it only ever fires for two
-- rows that share the same non-null (provider, providerAccountId) pair,
-- i.e. the same Google account attached twice.
CREATE UNIQUE INDEX "authentication_methods_provider_providerAccountId_key" ON "authentication_methods"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "authentication_methods_userId_provider_key" ON "authentication_methods"("userId", "provider");

-- CreateIndex
CREATE INDEX "authentication_methods_userId_idx" ON "authentication_methods"("userId");

-- AddForeignKey
ALTER TABLE "authentication_methods" ADD CONSTRAINT "authentication_methods_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Data backfill — deterministic, lossless: every existing user authenticates
-- with a password today, so every one gets exactly one EMAIL_PASSWORD row
-- (providerAccountId NULL — Google's sub is the only populated value this
-- column ever holds). Makes this table a complete authentication-method
-- ledger from the moment this migration completes, not a Google-only
-- afterthought (contract §7.1).
INSERT INTO "authentication_methods" ("id", "userId", "provider", "providerAccountId", "createdAt")
SELECT gen_random_uuid(), "id", 'EMAIL_PASSWORD', NULL, "createdAt"
FROM "users";
