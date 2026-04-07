-- CreateTable: refresh_tokens
-- Stores HttpOnly refresh tokens for the JWT rotation flow.
-- One user can have multiple active sessions (e.g. browser + mobile).
-- Tokens are deleted on logout, password reset, or expiry cleanup.

CREATE TABLE "refresh_tokens" (
    "id"        SERIAL          NOT NULL,
    "userId"    INTEGER         NOT NULL,
    "token"     TEXT            NOT NULL,
    "expiresAt" TIMESTAMP(3)    NOT NULL,
    "createdAt" TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- Token is the lookup key — must be unique
CREATE UNIQUE INDEX "refresh_tokens_token_key" ON "refresh_tokens"("token");

-- userId index for fast deleteMany on logout / password reset
CREATE INDEX "refresh_tokens_userId_idx" ON "refresh_tokens"("userId");
