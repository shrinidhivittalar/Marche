-- Service modes + location-requirement rules — Slice 2 of the
-- category-requirements work. Job.categoryTemplateId and Job.categoryData
-- are NOT part of this migration — those are Slice 4.
--
-- Purely additive: one new enum, two new columns on category_templates,
-- one new nullable column on jobs. No existing column touched, no
-- back-fill. Safe to run against the populated database.
--
-- Every CategoryTemplate row that already exists gets allowedModes = {}
-- and locationRequired = false from the column defaults below — not a
-- guess at what those versions "should" have meant, but the only answer
-- consistent with the immutability rule the whole feature depends on: a
-- version's rules are exactly what its own row says, and a version created
-- before this column existed said nothing. See
-- CategoryTemplatesService.assertModeAndLocation for where an empty
-- allowedModes is read as "no restriction configured yet", not "no mode is
-- allowed" — the distinction this default depends on downstream.

-- CreateEnum
CREATE TYPE "ServiceMode" AS ENUM ('ONSITE', 'REMOTE', 'HYBRID');

-- AlterTable
ALTER TABLE "category_templates" ADD COLUMN "allowedModes" "ServiceMode"[] DEFAULT ARRAY[]::"ServiceMode"[];
ALTER TABLE "category_templates" ADD COLUMN "locationRequired" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "jobs" ADD COLUMN "serviceMode" "ServiceMode";
