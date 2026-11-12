-- Sign-in hardening.
--
-- 1. users.sessionVersion goes into every access token (sv). Raising it (password
--    change or reset, 2FA change, "sign out everywhere") cancels every token signed
--    before. Tokens signed before this column existed carry no sv and count as 0.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "sessionVersion" INTEGER NOT NULL DEFAULT 0;

-- 2. API keys, refresh tokens and password reset/invite tokens are stored only as
--    'sha256:' || hex(sha256(value)) — the same as auth/token-hash.ts — so a copy of
--    the database can't be used to sign in. Existing values are hashed in place, so
--    keys keep working and nobody is signed out. Rows already hashed are skipped,
--    which makes this safe to run again.
ALTER TABLE "api_keys" ADD COLUMN IF NOT EXISTS "prefix" TEXT NOT NULL DEFAULT '';

UPDATE "api_keys"
SET "prefix" = left("key", 7) || '…' || right("key", 4),
    "key" = 'sha256:' || encode(sha256(convert_to("key", 'UTF8')), 'hex')
WHERE "key" NOT LIKE 'sha256:%';

UPDATE "refresh_tokens"
SET "token" = 'sha256:' || encode(sha256(convert_to("token", 'UTF8')), 'hex')
WHERE "token" NOT LIKE 'sha256:%';

UPDATE "password_reset_tokens"
SET "token" = 'sha256:' || encode(sha256(convert_to("token", 'UTF8')), 'hex')
WHERE "token" NOT LIKE 'sha256:%';

-- 3. 2FA secrets are encrypted by the server on its next start (the key comes from
--    its settings, which SQL can't see): see AuthService.onModuleInit.
