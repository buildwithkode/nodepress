-- CreateTable: media_folders (self-referential tree for nested folders)
CREATE TABLE "media_folders" (
    "id"        SERIAL NOT NULL,
    "name"      TEXT NOT NULL,
    "parentId"  INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "media_folders_pkey" PRIMARY KEY ("id")
);

-- Add folderId column to media (nullable — null = root / unfiled)
ALTER TABLE "media" ADD COLUMN "folderId" INTEGER;

-- Indexes
CREATE INDEX "media_folders_parentId_idx" ON "media_folders"("parentId");
CREATE UNIQUE INDEX "media_folders_parentId_name_key" ON "media_folders"("parentId", "name");
CREATE INDEX "media_folderId_idx" ON "media"("folderId");

-- Foreign keys
ALTER TABLE "media_folders" ADD CONSTRAINT "media_folders_parentId_fkey"
    FOREIGN KEY ("parentId") REFERENCES "media_folders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "media" ADD CONSTRAINT "media_folderId_fkey"
    FOREIGN KEY ("folderId") REFERENCES "media_folders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
