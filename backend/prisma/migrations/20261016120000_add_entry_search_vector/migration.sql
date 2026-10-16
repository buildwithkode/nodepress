-- Full-text search index for the dynamic API's ?search= parameter.
--
-- Previously every search ran to_tsvector() over each row's whole JSON at query
-- time — a sequential scan of the content type that slows linearly with size.
-- A STORED generated column keeps the vector up to date on every write, and the
-- GIN index makes `search_vector @@ query` an index lookup.
--
-- Note: adding a stored generated column rewrites the table. On very large
-- installs, run this migration during a maintenance window.
--
-- IF NOT EXISTS keeps it safe to run on databases already synced another way.
ALTER TABLE "entries"
  ADD COLUMN IF NOT EXISTS "search_vector" tsvector
  GENERATED ALWAYS AS (
    to_tsvector('english'::regconfig, coalesce("slug", '') || ' ' || coalesce("data"::text, ''))
  ) STORED;

CREATE INDEX IF NOT EXISTS "entries_search_vector_idx" ON "entries" USING GIN ("search_vector");
