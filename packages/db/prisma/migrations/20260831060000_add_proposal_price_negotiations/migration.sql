-- Negotiated commercial terms on a Proposal.
--
-- Purely additive: one new enum, one new table, two new nullable columns on
-- proposals. No existing column touched, no back-fill. Safe to run against
-- the populated database.
--
-- One constraint here is load-bearing rather than hygiene:
--
--   proposal_price_negotiations_one_pending_per_proposal
--       At most one PROPOSED round per proposal at a time. A plain unique
--       index on proposalId would forbid a *second* round ever existing on
--       that proposal at all, which is wrong — rounds accumulate as history.
--       What must never happen is two simultaneously PROPOSED rounds on the
--       same proposal, which is what this WHERE-qualified (partial) unique
--       index enforces. Same reasoning module5's own migration recorded for
--       why proposals.jobId_providerProfileId_key is absolute rather than
--       partial: Prisma's schema language cannot express a partial index,
--       so it is hand-written here and the service layer's own pre-check
--       exists only to produce a useful message, not to be the enforcement.
--
-- Deliberately absent:
--
--   A cascade from proposedByProfileId/respondedByProfileId to Profile —
--   left as the Prisma-default RESTRICT. Profile rows are never hard-
--   deleted in this application (see profiles.repository.ts's own comment:
--   "Profile has a deletedAt column but no soft-delete flow sets it yet"),
--   so this is a defensive default, not a modelled cascade.

-- CreateEnum
CREATE TYPE "ProposalPriceNegotiationStatus" AS ENUM ('PROPOSED', 'ACCEPTED', 'REJECTED', 'WITHDRAWN');

-- AlterTable
ALTER TABLE "proposals" ADD COLUMN "agreedPrice" DECIMAL(10,2);
ALTER TABLE "proposals" ADD COLUMN "agreedPriceAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "proposal_price_negotiations" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "proposedByProfileId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "status" "ProposalPriceNegotiationStatus" NOT NULL DEFAULT 'PROPOSED',
    "respondedByProfileId" TEXT,
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "proposal_price_negotiations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "proposal_price_negotiations_proposalId_status_idx" ON "proposal_price_negotiations"("proposalId", "status");

-- CreateIndex
-- The enforcement. See the header.
CREATE UNIQUE INDEX "proposal_price_negotiations_one_pending_per_proposal" ON "proposal_price_negotiations"("proposalId") WHERE "status" = 'PROPOSED';

-- AddForeignKey
ALTER TABLE "proposal_price_negotiations" ADD CONSTRAINT "proposal_price_negotiations_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "proposals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proposal_price_negotiations" ADD CONSTRAINT "proposal_price_negotiations_proposedByProfileId_fkey" FOREIGN KEY ("proposedByProfileId") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proposal_price_negotiations" ADD CONSTRAINT "proposal_price_negotiations_respondedByProfileId_fkey" FOREIGN KEY ("respondedByProfileId") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
