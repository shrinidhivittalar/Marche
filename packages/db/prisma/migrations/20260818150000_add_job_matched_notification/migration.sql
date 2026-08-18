-- Job Alerts. Purely additive: one new enum value, no existing column touched.
-- Safe to run against the populated database.

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'JOB_MATCHED';
