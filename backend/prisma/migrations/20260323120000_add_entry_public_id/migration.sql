-- Step 1: Add publicId as nullable so existing rows don't violate NOT NULL
ALTER TABLE "entries" ADD COLUMN "publicId" TEXT;

-- Step 2: Backfill all existing rows with a native PostgreSQL UUID v4
--         gen_random_uuid() is built into PostgreSQL 13+ (pgcrypto extension not needed)
UPDATE "entries" SET "publicId" = gen_random_uuid()::TEXT WHERE "publicId" IS NULL;

-- Step 3: Make the column required and add the unique constraint
ALTER TABLE "entries" ALTER COLUMN "publicId" SET NOT NULL;
ALTER TABLE "entries" ADD CONSTRAINT "entries_publicId_key" UNIQUE ("publicId");
