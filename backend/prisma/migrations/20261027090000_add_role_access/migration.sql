-- Module access per role (none / view / edit).
CREATE TABLE IF NOT EXISTS "role_access" (
    "id" SERIAL NOT NULL,
    "role" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    CONSTRAINT "role_access_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "role_access_role_module_key" ON "role_access"("role", "module");
