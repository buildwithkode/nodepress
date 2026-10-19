-- Focal point for cover crops in on-the-fly image transforms. IF NOT EXISTS so
-- it can also be applied by hand to databases created with `prisma db push`.
ALTER TABLE "media" ADD COLUMN IF NOT EXISTS "focalX" DOUBLE PRECISION;
ALTER TABLE "media" ADD COLUMN IF NOT EXISTS "focalY" DOUBLE PRECISION;
