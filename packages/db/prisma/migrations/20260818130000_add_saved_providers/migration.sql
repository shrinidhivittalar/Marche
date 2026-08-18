-- Saved Talent — a client bookmarking a provider's profile.
--
-- Purely additive: one new table, no existing column touched. Safe to run
-- against the populated database.

-- CreateTable
CREATE TABLE "saved_providers" (
    "id" TEXT NOT NULL,
    "clientProfileId" TEXT NOT NULL,
    "providerProfileId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saved_providers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- One save per client per provider — a second save click unsaves instead.
CREATE UNIQUE INDEX "saved_providers_clientProfileId_providerProfileId_key" ON "saved_providers"("clientProfileId", "providerProfileId");

-- CreateIndex
CREATE INDEX "saved_providers_clientProfileId_idx" ON "saved_providers"("clientProfileId");

-- CreateIndex
CREATE INDEX "saved_providers_providerProfileId_idx" ON "saved_providers"("providerProfileId");

-- AddForeignKey
ALTER TABLE "saved_providers" ADD CONSTRAINT "saved_providers_clientProfileId_fkey" FOREIGN KEY ("clientProfileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_providers" ADD CONSTRAINT "saved_providers_providerProfileId_fkey" FOREIGN KEY ("providerProfileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
