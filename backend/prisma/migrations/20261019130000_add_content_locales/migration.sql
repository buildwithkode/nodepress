-- Configurable content languages. IF NOT EXISTS so it can also be applied by
-- hand to databases created with `prisma db push`.
ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "locales" JSONB NOT NULL DEFAULT '["en"]';
ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "defaultLocale" TEXT NOT NULL DEFAULT 'en';

-- Seed the enabled list with every locale existing entries already use, so
-- upgrading never hides translations from the admin UI.
INSERT INTO "settings" ("id", "updatedAt") VALUES (1, CURRENT_TIMESTAMP) ON CONFLICT ("id") DO NOTHING;
UPDATE "settings"
SET "locales" = (
  SELECT to_jsonb(array_agg(l ORDER BY (l <> 'en'), l))
  FROM (SELECT 'en' AS l UNION SELECT DISTINCT "locale" FROM "entries" WHERE "locale" IS NOT NULL) s
)
WHERE "id" = 1 AND "locales" = '["en"]'::jsonb;
