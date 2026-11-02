-- Files sent with form submissions. Private: kept here rather than in the public uploads folder.
CREATE TABLE IF NOT EXISTS "form_files" (
    "id" TEXT NOT NULL,
    "submissionId" INTEGER NOT NULL,
    "field" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimetype" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "form_files_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "form_files_submissionId_idx" ON "form_files"("submissionId");
DO $$ BEGIN
  ALTER TABLE "form_files" ADD CONSTRAINT "form_files_submissionId_fkey"
    FOREIGN KEY ("submissionId") REFERENCES "form_submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
