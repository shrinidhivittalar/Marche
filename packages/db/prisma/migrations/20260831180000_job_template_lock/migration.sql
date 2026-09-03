-- Template version locking + categoryData — Slice 4 of the
-- category-requirements-location work.
--
-- Purely additive: two new nullable columns on jobs, one new FK. No
-- existing column touched, no back-fill — every existing Job simply has
-- categoryTemplateId = NULL, categoryData = NULL, the same "nothing
-- configured" state Slice 2 already tolerates for serviceMode.
--
-- categoryTemplateId is set once, at whichever moment locks a Job to a
-- template version — creation, or a later categoryId change — and never
-- rewritten outside of that. Nothing in the schema itself can express
-- "write-once-per-lock-event"; that invariant lives in application code
-- (JobsService.create/update, CategoryTemplatesService.resolveLockedTemplate),
-- the same way "a template version is never updated" lives in application
-- code rather than the schema for category_templates itself.
--
-- jobs_categoryTemplateId_fkey (RESTRICT)
--     Matches categories_activeCategoryTemplateId_fkey: a template is
--     never deleted once created, so this is largely theoretical, but a
--     Job silently losing its lock because of an unrelated delete
--     elsewhere would be a worse failure mode than the delete failing
--     loudly instead.

-- AlterTable
ALTER TABLE "jobs" ADD COLUMN "categoryTemplateId" TEXT;
ALTER TABLE "jobs" ADD COLUMN "categoryData" JSONB;

-- CreateIndex
CREATE INDEX "jobs_categoryTemplateId_idx" ON "jobs"("categoryTemplateId");

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_categoryTemplateId_fkey" FOREIGN KEY ("categoryTemplateId") REFERENCES "category_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
