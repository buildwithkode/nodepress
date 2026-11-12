import { open, seal } from '../common/secret-box';

/**
 * 2FA (TOTP) secrets are stored encrypted with the settings secret box
 * (AES-256-GCM, key from SETTINGS_SECRET or JWT_SECRET). Secrets saved before
 * that are plain Base32; `readTotpSecret` still accepts them and
 * `AuthService.onModuleInit` encrypts them on the next start.
 *
 * If the key changes, the secret can't be read and the authenticator code
 * stops working; the account's recovery codes (hashed separately) still sign
 * in and turn 2FA off.
 */
const SEALED_PREFIX = 'enc:v1:';

export function isSealedTotpSecret(stored: string): boolean {
  return stored.startsWith(SEALED_PREFIX);
}

export function sealTotpSecret(secret: string): string {
  return seal(secret);
}

/** The Base32 secret, or null when there is none or it can't be decrypted. */
export function readTotpSecret(stored: string | null | undefined): string | null {
  if (!stored) return null;
  return isSealedTotpSecret(stored) ? open(stored) : stored;
}
