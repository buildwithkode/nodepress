-- The order of the Content Types page, chosen by dragging rows. Starts as the newest-first order the page used before.
ALTER TABLE "content_types" ADD COLUMN IF NOT EXISTS "position" INTEGER NOT NULL DEFAULT 0;

UPDATE "content_types" c
SET "position" = ranked.n
FROM (SELECT "id", (row_number() OVER (ORDER BY "createdAt" DESC, "id" DESC) - 1)::int AS n FROM "content_types") ranked
WHERE c."id" = ranked."id";
