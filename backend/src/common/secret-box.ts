import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import { env } from '../config/env';

/**
 * Encrypts secrets stored in the database (SMTP password, S3 secret key) with
 * AES-256-GCM. The key is derived from SETTINGS_SECRET, or JWT_SECRET when
 * that isn't set — so changing it makes saved secrets unreadable (they then
 * show as "not set" and have to be entered again).
 */
const PREFIX = 'enc:v1:';

function key(): Buffer {
  return createHash('sha256').update(`nodepress-settings:${env.SETTINGS_SECRET ?? env.JWT_SECRET}`).digest();
}

export function seal(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return PREFIX + Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64');
}

/** The plain text, or null when it can't be decrypted (wrong key, tampered, not sealed). */
export function open(sealed: string | null | undefined): string | null {
  if (!sealed || !sealed.startsWith(PREFIX)) return null;
  try {
    const raw = Buffer.from(sealed.slice(PREFIX.length), 'base64');
    const decipher = createDecipheriv('aes-256-gcm', key(), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}
