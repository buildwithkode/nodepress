-- DropForeignKey
ALTER TABLE "content_type_schema_versions" DROP CONSTRAINT "content_type_schema_versions_contentTypeId_fkey";

-- DropIndex
DROP INDEX "entries_contentTypeId_status_idx";

-- DropIndex
DROP INDEX "entries_createdAt_idx";

-- DropIndex
DROP INDEX "media_createdAt_idx";

-- DropIndex
DROP INDEX "media_uploadedBy_idx";

-- AlterTable
ALTER TABLE "forms" ADD COLUMN     "captchaEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "permissions" ALTER COLUMN "actions" DROP DEFAULT;

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'editor';

-- CreateTable
CREATE TABLE "webhook_deliveries" (
    "id" SERIAL NOT NULL,
    "webhookId" INTEGER NOT NULL,
    "event" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextRetryAt" TIMESTAMP(3),
    "responseStatus" INTEGER,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "webhook_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "webhook_deliveries_status_nextRetryAt_idx" ON "webhook_deliveries"("status", "nextRetryAt");

-- CreateIndex
CREATE INDEX "webhook_deliveries_webhookId_idx" ON "webhook_deliveries"("webhookId");

-- CreateIndex
CREATE INDEX "entries_createdAt_idx" ON "entries"("createdAt");

-- AddForeignKey
ALTER TABLE "content_type_schema_versions" ADD CONSTRAINT "content_type_schema_versions_contentTypeId_fkey" FOREIGN KEY ("contentTypeId") REFERENCES "content_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "entries_public_lookup_idx" RENAME TO "entries_contentTypeId_status_deletedAt_idx";
