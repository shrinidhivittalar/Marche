-- Event timing, proposal deadline and deliverables on a requirement.
--
-- Purely additive: four nullable/defaulted columns and one index. Existing
-- rows keep working — a requirement without times or a deadline is still a
-- valid requirement.
--
-- These are the three fields the designed UI already asked for that the
-- first cut of the schema did not carry. They earn their place because a
-- provider cannot quote without them: a date with no hours is half a brief,
-- a requirement that never stops taking proposals has no cutoff, and
-- deliverables are the part being priced.
--
-- eventStartTime and eventEndTime are TEXT "HH:MM", not timestamps. They
-- are wall-clock hours at the event's own venue: a 6pm ceremony is at 6pm
-- for everyone in the room, whatever timezone the server or the reader is
-- in. Storing instants would make the displayed time depend on who is
-- looking, which is exactly wrong here.

-- AlterTable
ALTER TABLE "jobs" ADD COLUMN "eventStartTime" TEXT;
ALTER TABLE "jobs" ADD COLUMN "eventEndTime" TEXT;
ALTER TABLE "jobs" ADD COLUMN "proposalDeadline" TIMESTAMP(3);
ALTER TABLE "jobs" ADD COLUMN "deliverables" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateIndex
-- Serves "still open for proposals", which Module 5 checks on submission.
CREATE INDEX "jobs_proposalDeadline_idx" ON "jobs"("proposalDeadline");
