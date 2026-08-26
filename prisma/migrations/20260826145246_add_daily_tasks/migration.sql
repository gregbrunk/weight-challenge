-- CreateEnum
CREATE TYPE "TaskAutoRule" AS ENUM ('manual', 'activeCalsAtLeastTarget', 'consumedCalsAtMostCeiling');

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "autoRule" "TaskAutoRule" NOT NULL DEFAULT 'manual',
    "startDate" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskCompletion" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskCompletion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Task_planId_position_idx" ON "Task"("planId", "position");

-- CreateIndex
CREATE INDEX "TaskCompletion_taskId_date_idx" ON "TaskCompletion"("taskId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "TaskCompletion_taskId_date_key" ON "TaskCompletion"("taskId", "date");

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskCompletion" ADD CONSTRAINT "TaskCompletion_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
