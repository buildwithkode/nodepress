-- Track content type schema changes so breaking field renames/removals are detectable

CREATE TABLE "content_type_schema_versions" (
    "id"            SERIAL PRIMARY KEY,
    "contentTypeId" INTEGER NOT NULL,
    "schema"        JSONB   NOT NULL,
    "changedBy"     INTEGER,             -- userId who made the change (null = system/API key)
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "content_type_schema_versions_contentTypeId_fkey"
        FOREIGN KEY ("contentTypeId")
        REFERENCES "content_types"("id") ON DELETE CASCADE
);

CREATE INDEX "content_type_schema_versions_contentTypeId_idx"
    ON "content_type_schema_versions"("contentTypeId");

CREATE INDEX "content_type_schema_versions_createdAt_idx"
    ON "content_type_schema_versions"("createdAt" DESC);
