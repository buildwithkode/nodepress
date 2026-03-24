-- Composite index for the most common public API query pattern:
-- WHERE "contentTypeId" = ? AND status = 'published' AND "deletedAt" IS NULL
-- Replaces three separate index scans with one efficient composite lookup.
CREATE INDEX IF NOT EXISTS "entries_public_lookup_idx"
  ON "entries" ("contentTypeId", status, "deletedAt");
