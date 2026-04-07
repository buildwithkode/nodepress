-- Performance indexes for common query patterns
-- Entry queries: filter by contentType, status, deletedAt, createdAt
CREATE INDEX IF NOT EXISTS "entries_contentTypeId_idx" ON "entries"("contentTypeId");
CREATE INDEX IF NOT EXISTS "entries_status_idx"        ON "entries"("status");
CREATE INDEX IF NOT EXISTS "entries_deletedAt_idx"     ON "entries"("deletedAt");
CREATE INDEX IF NOT EXISTS "entries_createdAt_idx"     ON "entries"("createdAt" DESC);

-- Audit log: filter by resource+date (admin log page), by date alone (pagination)
CREATE INDEX IF NOT EXISTS "audit_logs_resource_createdAt_idx" ON "audit_logs"("resource", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "audit_logs_createdAt_idx"          ON "audit_logs"("createdAt" DESC);

-- Form submissions: list all submissions for a form (ordered by date)
CREATE INDEX IF NOT EXISTS "form_submissions_formId_idx"            ON "form_submissions"("formId");
CREATE INDEX IF NOT EXISTS "form_submissions_formId_createdAt_idx"  ON "form_submissions"("formId", "createdAt" DESC);
