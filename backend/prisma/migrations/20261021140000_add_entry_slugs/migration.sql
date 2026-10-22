-- Translation groups: one row per content type + slug, shared by the entry's
-- translations. Backs list ?fallback=true ("is there a translation in X?").
CREATE TABLE IF NOT EXISTS "entry_slugs" (
    "contentTypeId" INTEGER NOT NULL,
    "slug" TEXT NOT NULL,

    CONSTRAINT "entry_slugs_pkey" PRIMARY KEY ("contentTypeId","slug")
);

INSERT INTO "entry_slugs" ("contentTypeId", "slug")
SELECT DISTINCT "contentTypeId", "slug" FROM "entries"
ON CONFLICT DO NOTHING;

-- The trigger fills it on every insert and slug/type change, from any writer.
CREATE OR REPLACE FUNCTION "entries_ensure_slug_group"() RETURNS trigger AS $$
BEGIN
  INSERT INTO "entry_slugs" ("contentTypeId", "slug") VALUES (NEW."contentTypeId", NEW."slug")
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "entries_slug_group" ON "entries";
CREATE TRIGGER "entries_slug_group"
BEFORE INSERT OR UPDATE OF "slug", "contentTypeId" ON "entries"
FOR EACH ROW EXECUTE FUNCTION "entries_ensure_slug_group"();

DO $$ BEGIN
  ALTER TABLE "entry_slugs" ADD CONSTRAINT "entry_slugs_contentTypeId_fkey" FOREIGN KEY ("contentTypeId") REFERENCES "content_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "entries" ADD CONSTRAINT "entries_contentTypeId_slug_fkey" FOREIGN KEY ("contentTypeId", "slug") REFERENCES "entry_slugs"("contentTypeId", "slug") ON DELETE NO ACTION ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
