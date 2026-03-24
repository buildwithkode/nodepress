-- Phase 3: Audit log table for tracking all write operations

CREATE TABLE "audit_logs" (
  "id"         SERIAL PRIMARY KEY,
  "userId"     INTEGER,
  "userEmail"  TEXT NOT NULL,
  "action"     TEXT NOT NULL,
  "resource"   TEXT NOT NULL,
  "resourceId" TEXT NOT NULL,
  "metadata"   JSONB,
  "ip"         TEXT,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "audit_logs_resource_resourceId_idx" ON "audit_logs"("resource", "resourceId");
CREATE INDEX "audit_logs_userId_idx" ON "audit_logs"("userId");
