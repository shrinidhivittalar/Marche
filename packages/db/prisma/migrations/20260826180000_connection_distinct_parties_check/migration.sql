-- Module 01 Slice 2 — self-dealing structural defense
-- (production-refactor/module1-implementation-contract.md §6.2).
--
-- Defensive backstop only, not the primary enforcement mechanism: the
-- primary checks are canonical User.id comparisons in ProposalsService
-- (submission + acceptance) and DirectContractsService (creation) — see
-- those files. This CHECK exists to catch what those should already make
-- impossible, exactly the same relationship the existing @@unique
-- constraints and the ADR-006 conditional-claim pattern already have to
-- their own service-layer pre-checks.
--
-- Verified safe before writing this migration: zero existing rows in the
-- test database violate this constraint (`SELECT count(*) FROM
-- connections WHERE "clientProfileId" = "providerProfileId"` returned 0).
-- Not applied to the hosted production database by this migration file
-- directly — applied only via the standard `db:deploy` step, same as
-- every other migration in this repository.
--
-- This is a Profile.id comparison, not a User.id comparison — acceptable
-- here, and only here, because a CHECK constraint cannot itself join
-- across tables to compare User.id directly, and Profile.userId's unique
-- constraint makes the two provably equivalent (see the contract §6.1).
ALTER TABLE "connections"
  ADD CONSTRAINT "connections_client_provider_distinct_check"
  CHECK ("clientProfileId" <> "providerProfileId");
