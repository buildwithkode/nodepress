-- Content releases: batches of entry changes published together, now or at scheduledAt.
-- CreateTable
CREATE TABLE IF NOT EXISTS "releases" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "scheduledAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "error" TEXT,
    "createdBy" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "releases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "release_items" (
    "id" SERIAL NOT NULL,
    "releaseId" INTEGER NOT NULL,
    "entryId" INTEGER NOT NULL,
    "action" TEXT NOT NULL DEFAULT 'publish',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "release_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "releases_status_scheduledAt_idx" ON "releases"("status", "scheduledAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "release_items_entryId_idx" ON "release_items"("entryId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "release_items_releaseId_entryId_key" ON "release_items"("releaseId", "entryId");

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'release_items_releaseId_fkey') THEN
    ALTER TABLE "release_items" ADD CONSTRAINT "release_items_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "releases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'release_items_entryId_fkey') THEN
    ALTER TABLE "release_items" ADD CONSTRAINT "release_items_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

