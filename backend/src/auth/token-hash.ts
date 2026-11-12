import { createHash } from 'crypto';

/**
 * Refresh tokens, password reset/invite tokens and API keys are stored only as
 * a SHA-256 hash, so someone who reads the database can't use them. The raw
 * value goes to its owner once (cookie, emailed link, key shown at creation)
 * and is hashed again to look it up.
 *
 * The `sha256:` prefix marks a stored value as hashed, which keeps the
 * migration that hashed the existing rows safe to run twice. It matches
 * `'sha256:' || encode(sha256(convert_to(value, 'UTF8')), 'hex')` in SQL.
 * These tokens are long and random, so a plain (fast) hash is enough; slow
 * hashing is only needed for passwords people choose.
 */
export const TOKEN_HASH_PREFIX = 'sha256:';

export function hashToken(raw: string): string {
  return TOKEN_HASH_PREFIX + createHash('sha256').update(raw, 'utf8').digest('hex');
}
