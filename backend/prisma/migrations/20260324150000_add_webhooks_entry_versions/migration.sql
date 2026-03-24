-- CreateTable: webhooks
CREATE TABLE "webhooks" (
    "id"        SERIAL NOT NULL,
    "name"      TEXT NOT NULL,
    "url"       TEXT NOT NULL,
    "secret"    TEXT,
    "events"    JSONB NOT NULL,
    "enabled"   BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "webhooks_pkey" PRIMARY KEY ("id")
);

-- CreateTable: entry_versions
CREATE TABLE "entry_versions" (
    "id"        SERIAL NOT NULL,
    "entryId"   INTEGER NOT NULL,
    "slug"      TEXT NOT NULL,
    "data"      JSONB NOT NULL,
    "status"    TEXT NOT NULL,
    "createdBy" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "entry_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "entry_versions_entryId_createdAt_idx" ON "entry_versions"("entryId", "createdAt");

-- AddForeignKey
ALTER TABLE "entry_versions" ADD CONSTRAINT "entry_versions_entryId_fkey"
    FOREIGN KEY ("entryId") REFERENCES "entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
