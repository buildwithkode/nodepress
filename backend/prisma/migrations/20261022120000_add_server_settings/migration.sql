-- Email (SMTP) and file storage configured from the admin; secrets inside are encrypted by the app.
ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "mail" JSONB,
ADD COLUMN IF NOT EXISTS "storage" JSONB;
