-- Phase 4: Media library table — tracks all uploaded files including S3 keys and WebP versions

CREATE TABLE "media" (
  "id"           SERIAL PRIMARY KEY,
  "filename"     TEXT NOT NULL UNIQUE,
  "webpFilename" TEXT,
  "url"          TEXT NOT NULL,
  "webpUrl"      TEXT,
  "originalName" TEXT NOT NULL,
  "mimetype"     TEXT NOT NULL,
  "size"         INTEGER NOT NULL,
  "width"        INTEGER,
  "height"       INTEGER,
  "uploadedBy"   INTEGER,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "media_createdAt_idx" ON "media"("createdAt" DESC);
CREATE INDEX "media_uploadedBy_idx" ON "media"("uploadedBy");
