-- Backfills schema that was added to schema.prisma without a migration:
-- two-factor auth columns on users (6c7c05a) and the installed_plugins table
-- (1b6b34f). Without these, a database created with `prisma migrate deploy`
-- (every Docker install) failed on the first admin registration with
-- `column "twoFactorEnabled" does not exist`.
--
-- IF NOT EXISTS keeps this safe on databases that were synced with
-- `prisma db push`, which already have these objects.

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "twoFactorRecovery" JSONB;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "twoFactorSecret" TEXT;

CREATE TABLE IF NOT EXISTS "installed_plugins" (
    "id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "config" JSONB NOT NULL DEFAULT '{}',
    "installedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "installed_plugins_pkey" PRIMARY KEY ("id")
);
