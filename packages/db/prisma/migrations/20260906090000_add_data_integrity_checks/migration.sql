-- Belt-and-suspenders DB-level backstops for invariants that today are
-- enforced only in application code (PRODUCTION_READINESS_REVIEW.md §8).
-- Same reasoning as connections_client_provider_distinct_check
-- (20260826180000): the app already gets this right, this just makes a
-- future bug or manual data fix loud instead of silent.
--
-- Verified against zero violations in both the hosted production DB and
-- the test DB before writing this migration.

-- Job.categoryData is null iff Job.categoryTemplateId is null
-- (see Job.categoryData's own comment in schema.prisma for why).
ALTER TABLE "jobs"
  ADD CONSTRAINT "jobs_category_data_template_invariant_check"
  CHECK (("categoryData" IS NULL) = ("categoryTemplateId" IS NULL));

-- Review.rating is validated 1-5 in CreateReviewDto, but nothing at the DB
-- level stops a future backfill/direct-write path from corrupting the
-- public average-rating calculation with an out-of-range value.
ALTER TABLE "reviews"
  ADD CONSTRAINT "reviews_rating_range_check"
  CHECK (rating BETWEEN 1 AND 5);

-- Proposal's lifecycle timestamp is tied to its status: SUBMITTED has none
-- of the three set, and each terminal status has exactly its own timestamp
-- set and the other two null. All writes already route through
-- ProposalsService's STATUS_TIMESTAMP_FIELD map (proposals.repository.ts),
-- so this should never fire — cheap to enforce, expensive to debug if it
-- ever were violated.
ALTER TABLE "proposals"
  ADD CONSTRAINT "proposals_status_timestamp_check"
  CHECK (
    (status = 'SUBMITTED' AND "acceptedAt" IS NULL AND "rejectedAt" IS NULL AND "withdrawnAt" IS NULL)
    OR (status = 'ACCEPTED' AND "acceptedAt" IS NOT NULL AND "rejectedAt" IS NULL AND "withdrawnAt" IS NULL)
    OR (status = 'REJECTED' AND "rejectedAt" IS NOT NULL AND "acceptedAt" IS NULL AND "withdrawnAt" IS NULL)
    OR (status = 'WITHDRAWN' AND "withdrawnAt" IS NOT NULL AND "acceptedAt" IS NULL AND "rejectedAt" IS NULL)
  );

-- Supports a future reconciliation query ("all FAILED payments") — not
-- needed by any query today, cheap to add ahead of the table growing.
CREATE INDEX "payments_status_idx" ON "payments"("status");
