-- Background job queue (form actions, plugin tasks), claimed with
-- FOR UPDATE SKIP LOCKED by JobWorker. IF NOT EXISTS so it can also be applied
-- by hand to databases created with `prisma db push`.

-- CreateTable
CREATE TABLE IF NOT EXISTS "jobs" (
    "id" SERIAL NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "runAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "jobs_status_runAt_idx" ON "jobs"("status", "runAt");
