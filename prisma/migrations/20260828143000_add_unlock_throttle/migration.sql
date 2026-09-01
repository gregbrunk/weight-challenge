-- Failed unlock attempts, per client.
--
-- Purely additive: one new table and its index. No existing table is altered,
-- no data is moved, and nothing references it by foreign key, so applying this
-- cannot disturb a plan, an entry or a photo.
--
-- The SQL is exactly what `prisma migrate diff` generates for the model, taken
-- from a database-free diff so the file could be reviewed before it was ever
-- run against the database shared with production.

-- CreateTable
CREATE TABLE "UnlockAttempt" (
    "clientKey" TEXT NOT NULL,
    "failures" INTEGER NOT NULL DEFAULT 0,
    "firstFailureAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedUntil" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UnlockAttempt_pkey" PRIMARY KEY ("clientKey")
);

-- CreateIndex
CREATE INDEX "UnlockAttempt_updatedAt_idx" ON "UnlockAttempt"("updatedAt");
