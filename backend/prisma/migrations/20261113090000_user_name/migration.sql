-- A display name for each admin user, edited on their own profile page.
-- Optional: the admin shows the email's local part when it's empty.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "name" TEXT;
