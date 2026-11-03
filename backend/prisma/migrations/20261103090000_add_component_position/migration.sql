-- The order of the Components page, chosen by dragging rows. Starts as the alphabetical order the page used before.
ALTER TABLE "components" ADD COLUMN IF NOT EXISTS "position" INTEGER NOT NULL DEFAULT 0;

UPDATE "components" c
SET "position" = ranked.n
FROM (SELECT "id", (row_number() OVER (ORDER BY "name") - 1)::int AS n FROM "components") ranked
WHERE c."id" = ranked."id";
