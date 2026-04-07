-- Add SEO metadata JSON column
ALTER TABLE "entries" ADD COLUMN "seo" JSONB;

-- Add scheduled publish datetime column
ALTER TABLE "entries" ADD COLUMN "publishAt" TIMESTAMP(3);

-- Index for the scheduler cron job query
CREATE INDEX "entries_publishAt_idx" ON "entries"("publishAt");
