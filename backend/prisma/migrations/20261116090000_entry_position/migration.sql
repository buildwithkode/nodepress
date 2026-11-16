-- Entry order: dragged in the admin list, readable with ?sort=position:asc.
-- All languages of a page (same content type + slug) share one position.
ALTER TABLE "entries" ADD COLUMN IF NOT EXISTS "position" INTEGER NOT NULL DEFAULT 0;

-- Existing entries keep today's order: newest page first.
UPDATE "entries" e
SET "position" = r.pos
FROM (
  SELECT "contentTypeId", slug,
         ROW_NUMBER() OVER (PARTITION BY "contentTypeId" ORDER BY MIN("createdAt") DESC, MIN(id) DESC) AS pos
  FROM "entries"
  GROUP BY "contentTypeId", slug
) r
WHERE e."contentTypeId" = r."contentTypeId" AND e.slug = r.slug AND e."position" = 0;

CREATE INDEX IF NOT EXISTS "entries_contentTypeId_position_id_idx" ON "entries"("contentTypeId", "position", "id");

-- A new entry without a position joins its page's other languages, or goes first.
-- Covers every way of creating entries (admin, API, imports, plugins).
CREATE OR REPLACE FUNCTION entries_default_position() RETURNS trigger AS $$
BEGIN
  NEW."position" := COALESCE(
    (SELECT "position" FROM "entries" WHERE "contentTypeId" = NEW."contentTypeId" AND slug = NEW.slug LIMIT 1),
    (SELECT MIN("position") - 1 FROM "entries" WHERE "contentTypeId" = NEW."contentTypeId"),
    0
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS entries_default_position ON "entries";
CREATE TRIGGER entries_default_position
  BEFORE INSERT ON "entries"
  FOR EACH ROW WHEN (NEW."position" = 0)
  EXECUTE FUNCTION entries_default_position();
