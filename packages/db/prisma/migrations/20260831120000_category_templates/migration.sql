-- Category templates + dynamic fields — Slice 3 of the category-requirements
-- work. No ServiceMode, no Job.categoryData, no Job.categoryTemplateId here
-- — those are later slices; this migration only builds the versioned
-- configuration model itself.
--
-- Purely additive: one new enum, two new tables, one new nullable column on
-- categories. No existing column touched, no back-fill. Safe to run
-- against the populated database.
--
-- The versioning strategy this schema encodes, in one sentence:
-- category_templates rows are never updated or deleted after creation —
-- "changing" a template means inserting a new row and repointing
-- categories.activeCategoryTemplateId, which is why that column is
-- nullable (not every category has one yet) and why there is no UPDATE
-- path anywhere in the application code for either new table.
--
-- Two constraints here are worth reading rather than skimming:
--
--   category_template_fields_categoryTemplateId_key_key
--       One machine key per template version. Same reasoning as
--       proposals_jobId_providerProfileId_key: the service layer's own
--       pre-check exists to produce a readable message, not to be the
--       enforcement — this is what actually holds under concurrency.
--
--   categories_activeCategoryTemplateId_fkey (RESTRICT)
--       Not SET NULL. A template is never deleted once created (nothing in
--       this schema or the application code deletes one), so this is
--       largely theoretical in practice, but a category silently losing
--       its active-template pointer because of an unrelated delete
--       elsewhere would be a worse failure mode than the delete failing
--       loudly instead.

-- CreateEnum
CREATE TYPE "CategoryTemplateFieldType" AS ENUM ('TEXT', 'NUMBER', 'BOOLEAN', 'SELECT', 'MULTI_SELECT', 'DATE');

-- CreateTable
CREATE TABLE "category_templates" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "category_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "category_template_fields" (
    "id" TEXT NOT NULL,
    "categoryTemplateId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" "CategoryTemplateFieldType" NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,
    "options" JSONB,
    "validation" JSONB,

    CONSTRAINT "category_template_fields_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "categories" ADD COLUMN "activeCategoryTemplateId" TEXT;

-- CreateIndex
CREATE INDEX "category_templates_categoryId_idx" ON "category_templates"("categoryId");

-- CreateIndex
CREATE INDEX "category_template_fields_categoryTemplateId_idx" ON "category_template_fields"("categoryTemplateId");

-- CreateIndex
-- One machine key per template version. See the header.
CREATE UNIQUE INDEX "category_template_fields_categoryTemplateId_key_key" ON "category_template_fields"("categoryTemplateId", "key");

-- CreateIndex
CREATE INDEX "categories_activeCategoryTemplateId_idx" ON "categories"("activeCategoryTemplateId");

-- AddForeignKey
-- Restrict: deleting a category that still has template versions must fail
-- loudly, matching every other parent-of-versioned-rows relationship in
-- this schema (Job -> Proposal is the one exception, and Cascade there is
-- deliberate for a different reason — see proposals' own migration).
ALTER TABLE "category_templates" ADD CONSTRAINT "category_templates_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "category_templates" ADD CONSTRAINT "category_templates_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
-- Cascade: a field means nothing without the template version that owns
-- it, and a template is never deleted anyway (see the header) — this is
-- symmetry with every other detail-row-belongs-to-parent relationship in
-- this schema, not something expected to actually fire.
ALTER TABLE "category_template_fields" ADD CONSTRAINT "category_template_fields_categoryTemplateId_fkey" FOREIGN KEY ("categoryTemplateId") REFERENCES "category_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
-- Restrict. See the header.
ALTER TABLE "categories" ADD CONSTRAINT "categories_activeCategoryTemplateId_fkey" FOREIGN KEY ("activeCategoryTemplateId") REFERENCES "category_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
