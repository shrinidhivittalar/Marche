-- Onboarding-wizard answers on Profile.
--
-- Both onboarding screens (ClientOnboardingPage, ProviderOnboardingPage)
-- already ask these questions today, but the answers were only ever held
-- in component state and discarded on submit — there was no column to put
-- them in. Purely additive: five nullable/defaulted columns, no existing
-- row affected.
--
-- Nothing reads these back yet (no personalization feature exists in
-- Phase 1); they are stored as asked so a later feature can consume them
-- without a second migration.

-- CreateEnum
CREATE TYPE "ProviderExperienceLevel" AS ENUM ('NEW', 'SOME_EXPERIENCE', 'EXPERT');

-- CreateEnum
CREATE TYPE "ProviderGoal" AS ENUM ('MAIN_INCOME', 'SIDE_INCOME', 'EXPERIENCE', 'UNDECIDED');

-- CreateEnum
CREATE TYPE "ProviderWorkPreference" AS ENUM ('FIND_OPPORTUNITIES', 'PACKAGE_SERVICES', 'CONTRACT_TO_HIRE');

-- AlterTable
ALTER TABLE "profiles" ADD COLUMN "experienceLevel" "ProviderExperienceLevel";
ALTER TABLE "profiles" ADD COLUMN "primaryGoal" "ProviderGoal";
ALTER TABLE "profiles" ADD COLUMN "workPreferences" "ProviderWorkPreference"[] DEFAULT ARRAY[]::"ProviderWorkPreference"[];
ALTER TABLE "profiles" ADD COLUMN "orgSize" TEXT;
ALTER TABLE "profiles" ADD COLUMN "website" TEXT;
