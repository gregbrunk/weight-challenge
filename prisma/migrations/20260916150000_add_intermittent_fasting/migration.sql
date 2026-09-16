-- CreateEnum
CREATE TYPE "FastingPlan" AS ENUM ('fast16_8', 'fast18_6', 'fast20_4');

-- AlterEnum
ALTER TYPE "TaskAutoRule" ADD VALUE 'fastGoalMet';

-- AlterTable
ALTER TABLE "Plan" ADD COLUMN     "fastingPlan" "FastingPlan";

-- AlterTable
ALTER TABLE "DailyEntry" ADD COLUMN     "fastEndAt" TIMESTAMPTZ(3),
ADD COLUMN     "fastStartAt" TIMESTAMPTZ(3);
