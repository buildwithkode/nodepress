-- Phase 2: Add draft/publish status and soft delete support to entries

-- Add status column: all existing entries become 'published' (backward compatible)
ALTER TABLE "entries" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'published';

-- Add soft-delete column: null = active entry
ALTER TABLE "entries" ADD COLUMN "deletedAt" TIMESTAMP(3);

-- Index for common query patterns
CREATE INDEX "entries_status_idx" ON "entries"("status");
CREATE INDEX "entries_deletedAt_idx" ON "entries"("deletedAt");
CREATE INDEX "entries_contentTypeId_status_idx" ON "entries"("contentTypeId", "status");
