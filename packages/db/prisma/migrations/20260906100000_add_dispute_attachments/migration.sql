-- Dispute attachments: structured evidence, mirroring job_attachments
-- exactly (PRODUCTION_READINESS_REVIEW.md §8). Purely additive — the
-- existing free-text Dispute.evidence column is untouched.

-- CreateTable
CREATE TABLE "dispute_attachments" (
    "id" TEXT NOT NULL,
    "disputeId" TEXT NOT NULL,
    "mediaId" TEXT NOT NULL,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dispute_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "dispute_attachments_disputeId_idx" ON "dispute_attachments"("disputeId");

-- CreateIndex
-- The same file twice on one dispute is a mistake, not a feature.
CREATE UNIQUE INDEX "dispute_attachments_disputeId_mediaId_key" ON "dispute_attachments"("disputeId", "mediaId");

-- AddForeignKey
-- Cascade: deleting a dispute takes its attachment rows with it. The
-- underlying Media survives — it belongs to the user, not the dispute.
ALTER TABLE "dispute_attachments" ADD CONSTRAINT "dispute_attachments_disputeId_fkey" FOREIGN KEY ("disputeId") REFERENCES "disputes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
-- Restrict: deleting a file still attached to a dispute must fail loudly
-- rather than silently blank moderation evidence.
ALTER TABLE "dispute_attachments" ADD CONSTRAINT "dispute_attachments_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "media"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
