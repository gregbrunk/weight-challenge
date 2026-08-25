-- CreateEnum
CREATE TYPE "PlanStatus" AS ENUM ('active', 'archived');

-- CreateEnum
CREATE TYPE "PhotoSlot" AS ENUM ('front', 'side', 'back');

-- CreateTable
CREATE TABLE "Plan" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "PlanStatus" NOT NULL DEFAULT 'active',
    "startDate" DATE NOT NULL,
    "days" INTEGER NOT NULL,
    "rmr" INTEGER NOT NULL,
    "targetActiveCals" INTEGER NOT NULL,
    "lbsToLose" DOUBLE PRECISION NOT NULL,
    "calsPerLb" INTEGER NOT NULL DEFAULT 3500,
    "startWeight" DOUBLE PRECISION,
    "startBodyFat" DOUBLE PRECISION,
    "startVo2Max" DOUBLE PRECISION,
    "startSystolic" INTEGER,
    "startDiastolic" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyEntry" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "weight" DOUBLE PRECISION,
    "bodyFat" DOUBLE PRECISION,
    "vo2Max" DOUBLE PRECISION,
    "systolic" INTEGER,
    "diastolic" INTEGER,
    "consumedCals" INTEGER,
    "activeCals" INTEGER,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Photo" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "slot" "PhotoSlot" NOT NULL,
    "blobPath" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "bytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Photo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "passwordHash" TEXT,
    "sessionEpoch" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Plan_status_idx" ON "Plan"("status");

-- CreateIndex
CREATE INDEX "DailyEntry_planId_date_idx" ON "DailyEntry"("planId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "DailyEntry_planId_date_key" ON "DailyEntry"("planId", "date");

-- CreateIndex
CREATE INDEX "Photo_planId_date_idx" ON "Photo"("planId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Photo_planId_date_slot_key" ON "Photo"("planId", "date", "slot");

-- AddForeignKey
ALTER TABLE "DailyEntry" ADD CONSTRAINT "DailyEntry_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Photo" ADD CONSTRAINT "Photo_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
