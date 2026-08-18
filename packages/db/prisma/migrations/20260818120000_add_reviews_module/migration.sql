-- Module 5 — Reviews.
--
-- Purely additive: one new table, no existing column touched. Safe to run
-- against the populated database.
--
-- revieweeProfileId's FK is SET NULL on delete, not CASCADE (unlike
-- connectionId and reviewerUserId): a review is evidence about a completed
-- transaction and must survive the reviewee deleting their account, the
-- same way media.ownerUserId is deliberately not a cascade.

-- CreateTable
CREATE TABLE "reviews" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "reviewerUserId" TEXT NOT NULL,
    "revieweeProfileId" TEXT,
    "rating" INTEGER NOT NULL,
    "comment" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- One review per reviewer per connection — see Review's schema comment.
CREATE UNIQUE INDEX "reviews_connectionId_reviewerUserId_key" ON "reviews"("connectionId", "reviewerUserId");

-- CreateIndex
CREATE INDEX "reviews_connectionId_idx" ON "reviews"("connectionId");

-- CreateIndex
CREATE INDEX "reviews_revieweeProfileId_createdAt_idx" ON "reviews"("revieweeProfileId", "createdAt");

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_reviewerUserId_fkey" FOREIGN KEY ("reviewerUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_revieweeProfileId_fkey" FOREIGN KEY ("revieweeProfileId") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
