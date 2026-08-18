-- Module 5 — Messaging.
--
-- Purely additive: one new table, no existing column touched. Safe to run
-- against the populated database.
--
-- Cascade on both connectionId and senderUserId: a message with no
-- connection or no sender behind it is not a record worth keeping, same
-- reasoning as Notification.recipientUserId.

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "senderUserId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- Serves the thread for one connection, oldest first.
CREATE INDEX "messages_connectionId_createdAt_idx" ON "messages"("connectionId", "createdAt");

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_senderUserId_fkey" FOREIGN KEY ("senderUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
