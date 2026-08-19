-- CreateTable
CREATE TABLE "work_diary_entries" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "work_diary_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "work_diary_entries_connectionId_idx" ON "work_diary_entries"("connectionId");

-- CreateIndex
CREATE INDEX "work_diary_entries_authorUserId_idx" ON "work_diary_entries"("authorUserId");

-- AddForeignKey
ALTER TABLE "work_diary_entries" ADD CONSTRAINT "work_diary_entries_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_diary_entries" ADD CONSTRAINT "work_diary_entries_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
