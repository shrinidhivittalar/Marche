-- Job attachments: files a client adds to their requirement.
--
-- Purely additive. One new table, no existing column touched.
--
-- These are uploaded as PRIVATE media. A portfolio photo is advertising; a
-- requirement's attachment is working material that may name a venue, a
-- guest list or a budget. They are served through their own authenticated
-- endpoint rather than on the public requirement route, so who may see a
-- file is decided in one place.

-- CreateTable
CREATE TABLE "job_attachments" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "mediaId" TEXT NOT NULL,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "job_attachments_jobId_idx" ON "job_attachments"("jobId");

-- CreateIndex
-- The same file twice on one requirement is a mistake, not a feature.
CREATE UNIQUE INDEX "job_attachments_jobId_mediaId_key" ON "job_attachments"("jobId", "mediaId");

-- AddForeignKey
-- Cascade: deleting a requirement takes its attachment rows with it. The
-- underlying Media survives — it belongs to the user, not the requirement.
ALTER TABLE "job_attachments" ADD CONSTRAINT "job_attachments_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
-- Restrict: deleting a file still attached to a live requirement must fail
-- loudly rather than silently blank it. The owner detaches it first.
ALTER TABLE "job_attachments" ADD CONSTRAINT "job_attachments_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "media"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
