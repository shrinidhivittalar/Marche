-- Module 5 — Proposals, and the Connection a hire produces.
--
-- Purely additive: one new enum, three new tables, no existing column
-- touched and no back-fill. Safe to run against the populated database.
--
-- Three constraints here are load-bearing rather than hygiene, and are the
-- reason this migration is worth reading rather than skimming:
--
--   proposals_jobId_providerProfileId_key
--       One proposal per provider per requirement — the actual enforcement.
--       The service layer pre-checks only to produce a useful message; two
--       simultaneous submissions both pass that check before either writes.
--       Absolute, not partial, so withdrawal is final for that requirement
--       (module5.md, "Unique Constraints").
--
--   connections_jobId_key
--       The backstop for "exactly one winner". Acceptance claims the job
--       with a conditional UPDATE inside a transaction (ADR-006); this is
--       what still holds if that ordering is ever broken or the request is
--       retried after a lost response.
--
--   connections_proposalId_key
--       One accepted proposal produces one relationship.
--
-- Deliberately absent, each argued in schema.prisma above its model:
--
--   proposals.deletedAt   — nothing deletes a proposal; all three end
--                           states are retained on purpose
--   ConnectionStatus      — Phase 1 writes one value, so the row existing
--                           is what "active" means
--   proposals.providerUserId — the same fact as providerProfileId, twice

-- CreateEnum
CREATE TYPE "ProposalStatus" AS ENUM ('SUBMITTED', 'ACCEPTED', 'REJECTED', 'WITHDRAWN');

-- CreateTable
CREATE TABLE "proposals" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "providerProfileId" TEXT NOT NULL,
    "coverMessage" TEXT NOT NULL,
    "proposedPrice" DECIMAL(10,2) NOT NULL,
    "deliveryDays" INTEGER NOT NULL,
    "status" "ProposalStatus" NOT NULL DEFAULT 'SUBMITTED',
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "withdrawnAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "proposals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proposal_attachments" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "mediaId" TEXT NOT NULL,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "proposal_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "connections" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "clientProfileId" TEXT NOT NULL,
    "providerProfileId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "connections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- Serves the client's review list: proposals on one requirement, optionally
-- filtered by status. Leading on jobId, so it serves the unfiltered list too
-- and a separate jobId index would be redundant.
CREATE INDEX "proposals_jobId_status_idx" ON "proposals"("jobId", "status");

-- CreateIndex
-- The mirror: a provider's own proposals, optionally filtered.
CREATE INDEX "proposals_providerProfileId_status_idx" ON "proposals"("providerProfileId", "status");

-- CreateIndex
-- One proposal per provider per requirement. See the header.
CREATE UNIQUE INDEX "proposals_jobId_providerProfileId_key" ON "proposals"("jobId", "providerProfileId");

-- CreateIndex
CREATE INDEX "proposal_attachments_proposalId_idx" ON "proposal_attachments"("proposalId");

-- CreateIndex
-- The same file twice on one proposal is a mistake, not a feature.
CREATE UNIQUE INDEX "proposal_attachments_proposalId_mediaId_key" ON "proposal_attachments"("proposalId", "mediaId");

-- CreateIndex
-- "Exactly one winner", enforced by the database. See the header.
CREATE UNIQUE INDEX "connections_jobId_key" ON "connections"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "connections_proposalId_key" ON "connections"("proposalId");

-- CreateIndex
-- Serve "my connections" from either side.
CREATE INDEX "connections_clientProfileId_idx" ON "connections"("clientProfileId");

-- CreateIndex
CREATE INDEX "connections_providerProfileId_idx" ON "connections"("providerProfileId");

-- AddForeignKey
-- Cascade: a requirement that is genuinely deleted takes its proposals with
-- it. Reachable only through a deleted client profile — Module 4 hard-deletes
-- nothing else, and the one thing it does delete (a DRAFT job) can never have
-- proposals, since drafts are not discoverable.
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_providerProfileId_fkey" FOREIGN KEY ("providerProfileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proposal_attachments" ADD CONSTRAINT "proposal_attachments_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "proposals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
-- Restrict, matching every other media join: deleting a file still attached
-- to a live proposal must fail loudly rather than silently blank it.
ALTER TABLE "proposal_attachments" ADD CONSTRAINT "proposal_attachments_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "media"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "connections" ADD CONSTRAINT "connections_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "connections" ADD CONSTRAINT "connections_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "proposals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "connections" ADD CONSTRAINT "connections_clientProfileId_fkey" FOREIGN KEY ("clientProfileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "connections" ADD CONSTRAINT "connections_providerProfileId_fkey" FOREIGN KEY ("providerProfileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
