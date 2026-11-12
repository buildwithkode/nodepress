import { BadRequestException, Logger } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';

/**
 * Everything about stored passwords in one place: the bcrypt cost, the rules a
 * new password must pass, and the "unusable" passwords given to invited, SSO
 * and imported users.
 *
 * Hashes made with a lower cost keep working; `needsRehash()` tells the login
 * to upgrade them while it has the plain password.
 */
export const BCRYPT_ROUNDS = 12;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;

const logger = new Logger('Password');

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

/**
 * A password hash nobody knows the password to (invites, SSO, imported users).
 * 256 random bits can't be guessed, so the cheaper cost is fine here and keeps
 * importing many users fast.
 */
export function unusablePasswordHash(): Promise<string> {
  return bcrypt.hash(randomBytes(32).toString('hex'), 10);
}

/** False for a wrong password and for a malformed stored hash (never throws). */
export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  if (typeof plain !== 'string' || typeof hash !== 'string') return false;
  try {
    return await bcrypt.compare(plain, hash);
  } catch {
    return false;
  }
}

/** True when the stored hash is weaker than BCRYPT_ROUNDS (made before it was raised). */
export function needsRehash(hash: string): boolean {
  try {
    return bcrypt.getRounds(hash) < BCRYPT_ROUNDS;
  } catch {
    return false;
  }
}

let dummy: Promise<string> | undefined;

/**
 * Compare against a real hash of the same cost when the email has no account,
 * so a failed login takes as long either way and doesn't reveal which emails
 * exist.
 */
export async function verifyAgainstDummy(plain: string): Promise<false> {
  dummy ??= hashPassword(randomBytes(16).toString('hex'));
  await verifyPassword(plain, await dummy);
  return false;
}

// Passwords people pick most often that still pass the length rule. The
// breach check below catches far more; this list works offline.
const COMMON = new Set([
  'password', 'password1', 'password12', 'password123', 'password1234', 'passw0rd', 'p@ssw0rd', 'p@ssword',
  '12345678', '123456789', '1234567890', '12345678910', '87654321', '11111111', '00000000', '12341234',
  '11223344', '12121212', '123123123', '1q2w3e4r', '1qaz2wsx', 'qwertyui', 'qwerty123', 'qwerty12',
  'qwertyuiop', 'asdfghjk', 'asdfghjkl', 'zxcvbnm1', 'iloveyou', 'iloveyou1', 'sunshine', 'princess',
  'football', 'baseball', 'superman', 'whatever', 'trustno1', 'welcome1', 'welcome123', 'letmein1',
  'abcd1234', 'abc12345', 'abcdefgh', 'admin123', 'admin1234', 'administrator', 'changeme', 'changeme1',
  'nodepress', 'nodepress1', 'nodepress123',
]);

/**
 * Throws a 400 explaining what's wrong with a new password, or returns. Run it
 * wherever a person chooses a password (setup, reset/invite link, change).
 */
export async function assertAcceptablePassword(plain: string, email?: string): Promise<void> {
  if (typeof plain !== 'string' || plain.length < PASSWORD_MIN) {
    throw new BadRequestException(`Password must be at least ${PASSWORD_MIN} characters`);
  }
  if (plain.length > PASSWORD_MAX) {
    throw new BadRequestException(`Password must be at most ${PASSWORD_MAX} characters`);
  }
  const lower = plain.toLowerCase();
  if (COMMON.has(lower) || /^(.)\1+$/.test(plain)) {
    throw new BadRequestException('This password is too common. Choose a less predictable one.');
  }
  if (email) {
    const address = email.trim().toLowerCase();
    if (lower === address || lower === address.split('@')[0]) {
      throw new BadRequestException("Don't use your email address as your password.");
    }
  }
  if (await isBreachedPassword(plain)) {
    throw new BadRequestException(
      'This password has appeared in a known data breach, so attackers try it first. Choose a different one.',
    );
  }
}

/** PASSWORD_BREACH_CHECK=false turns the online check off; it's off in tests unless set. */
export function breachCheckEnabled(): boolean {
  const value = process.env.PASSWORD_BREACH_CHECK;
  if (value !== undefined && value !== '') return !['false', '0', 'off', 'no'].includes(value.trim().toLowerCase());
  return process.env.NODE_ENV !== 'test';
}

/**
 * Asks Have I Been Pwned whether the password is in a known breach, using its
 * k-anonymity range API: only the first 5 characters of the password's SHA-1
 * hash leave the server, never the password. If the service can't be reached
 * in 3 seconds the password is allowed: an offline server still works.
 */
export async function isBreachedPassword(plain: string, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  if (!breachCheckEnabled()) return false;
  const sha1 = createHash('sha1').update(plain, 'utf8').digest('hex').toUpperCase();
  const prefix = sha1.slice(0, 5);
  const suffix = sha1.slice(5);
  try {
    const res = await fetchImpl(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { 'Add-Padding': 'true', 'User-Agent': 'NodePress' },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) {
      logger.warn(`Breached-password check unavailable (HTTP ${res.status}); password allowed`);
      return false;
    }
    const body = await res.text();
    return body.split('\n').some((line) => {
      const [hashSuffix, count] = line.trim().split(':');
      return hashSuffix === suffix && Number(count) > 0;
    });
  } catch (err: any) {
    logger.warn(`Breached-password check unavailable (${err?.name ?? 'error'}); password allowed`);
    return false;
  }
}
