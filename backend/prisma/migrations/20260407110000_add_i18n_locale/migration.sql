-- Add locale column to entries (default 'en' for all existing rows)
ALTER TABLE "entries" ADD COLUMN "locale" TEXT NOT NULL DEFAULT 'en';

-- Drop old unique constraint (contentTypeId, slug)
DROP INDEX IF EXISTS "entries_contentTypeId_slug_key";

-- Create new unique constraint (contentTypeId, slug, locale)
CREATE UNIQUE INDEX "entries_contentTypeId_slug_locale_key" ON "entries"("contentTypeId", "slug", "locale");

-- Add locale index for filtering by language
CREATE INDEX "entries_locale_idx" ON "entries"("locale");
