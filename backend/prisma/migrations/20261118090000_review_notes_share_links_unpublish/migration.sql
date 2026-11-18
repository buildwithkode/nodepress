-- Scheduled unpublish: a published entry goes back to draft at this time.
ALTER TABLE "entries" ADD COLUMN IF NOT EXISTS "unpublishAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "entries_unpublishAt_idx" ON "entries"("unpublishAt");

-- Review notes on entries ("changes" = a change request, open until resolved).
CREATE TABLE IF NOT EXISTS "entry_notes" (
    "id" SERIAL NOT NULL,
    "entryId" INTEGER NOT NULL,
    "userId" INTEGER,
    "kind" TEXT NOT NULL DEFAULT 'comment',
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" INTEGER,

    CONSTRAINT "entry_notes_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "entry_notes_entryId_createdAt_idx" ON "entry_notes"("entryId", "createdAt");

-- Share links: one entry shown without a login until the link expires. Only the token's hash is kept.
CREATE TABLE IF NOT EXISTS "entry_share_links" (
    "id" SERIAL NOT NULL,
    "entryId" INTEGER NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdBy" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "entry_share_links_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "entry_share_links_tokenHash_key" ON "entry_share_links"("tokenHash");
CREATE INDEX IF NOT EXISTS "entry_share_links_entryId_idx" ON "entry_share_links"("entryId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'entry_notes_entryId_fkey') THEN
    ALTER TABLE "entry_notes" ADD CONSTRAINT "entry_notes_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'entry_share_links_entryId_fkey') THEN
    ALTER TABLE "entry_share_links" ADD CONSTRAINT "entry_share_links_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
