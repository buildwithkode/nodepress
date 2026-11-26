-- The order of the Forms page, chosen by dragging rows. Starts as the order the page used before: newest first.
ALTER TABLE "forms" ADD COLUMN IF NOT EXISTS "position" INTEGER NOT NULL DEFAULT 0;

UPDATE "forms" f
SET "position" = ranked.n
FROM (SELECT "id", (row_number() OVER (ORDER BY "createdAt" DESC, "id" DESC) - 1)::int AS n FROM "forms") ranked
WHERE f."id" = ranked."id";
