-- CreateTable: permissions
CREATE TABLE "permissions" (
    "id"          SERIAL NOT NULL,
    "role"        TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "actions"     TEXT[] NOT NULL DEFAULT '{}',
    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "permissions_role_contentType_key" ON "permissions"("role", "contentType");
CREATE INDEX "permissions_role_idx" ON "permissions"("role");

-- Seed default wildcard permissions for each role
INSERT INTO "permissions" ("role", "contentType", "actions") VALUES
  ('editor',      '*', ARRAY['create', 'read', 'update', 'delete', 'publish']),
  ('contributor', '*', ARRAY['create', 'read', 'update']),
  ('viewer',      '*', ARRAY['read']);
