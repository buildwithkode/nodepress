-- DropIndex
DROP INDEX "entries_contentTypeId_status_idx";

-- DropIndex
DROP INDEX "entries_deletedAt_idx";

-- DropIndex
DROP INDEX "entries_publishAt_idx";

-- DropIndex
DROP INDEX "entries_status_idx";

-- DropIndex
DROP INDEX "media_createdAt_idx";

-- DropIndex
DROP INDEX "media_uploadedBy_idx";

-- AlterTable
ALTER TABLE "webhooks" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_token_key" ON "password_reset_tokens"("token");

-- CreateIndex
CREATE INDEX "password_reset_tokens_userId_idx" ON "password_reset_tokens"("userId");
