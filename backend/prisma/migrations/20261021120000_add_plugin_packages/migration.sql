-- Uploaded plugin packages (admin → Plugins → Upload), loaded by every instance
-- at startup. IF NOT EXISTS so it can also be applied by hand to databases
-- created with `prisma db push`.

-- CreateTable
CREATE TABLE IF NOT EXISTS "plugin_packages" (
    "id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "manifest" JSONB NOT NULL,
    "archive" BYTEA NOT NULL,
    "sha256" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "signature" TEXT NOT NULL,
    "signerKeyId" TEXT,
    "uploadedBy" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "bootedAt" TIMESTAMP(3),
    "loadError" TEXT,

    CONSTRAINT "plugin_packages_pkey" PRIMARY KEY ("id")
);
