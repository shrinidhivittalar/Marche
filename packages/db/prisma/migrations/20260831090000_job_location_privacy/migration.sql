-- Job location privacy — Slice 1 of the category-requirements/location work.
--
-- Two changes, both against `jobs` only:
--
--   1. RENAME `location` -> `locationCoarse`. Every existing row's value is
--      preserved exactly — this is a column rename, not a drop-and-recreate,
--      so there is nothing to back-fill and no data loss. The value was
--      already a city/area-level label in practice (verified against the
--      frontend's own usage before this migration was written); the rename
--      documents what the column has always meant, it does not change it.
--
--   2. ADD `locationExact` (nullable JSONB). New column, defaults to NULL
--      for every existing row. Nothing populates it as part of this
--      migration or this slice — the disclosure mechanism (who may read it)
--      ships in this slice; a UI to actually collect a precise address is
--      deliberately deferred (see the slice report).
--
-- Purely additive plus one lossless rename. Safe to run against the
-- populated database. Application code in this same commit is updated to
-- read/write `locationCoarse` everywhere the old `location` column was used,
-- and `locationExact` is added to exactly one repository method
-- (JobsRepository.findLocationExact) — never to a shared select constant.

-- RenameColumn
ALTER TABLE "jobs" RENAME COLUMN "location" TO "locationCoarse";

-- AlterTable
ALTER TABLE "jobs" ADD COLUMN "locationExact" JSONB;
