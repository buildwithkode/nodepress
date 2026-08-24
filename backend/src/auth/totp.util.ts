import * as crypto from 'crypto';

// Standard Base32 Alphabet (RFC 4648)
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function toBase32(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';

  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i];
    bits += 8;

    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

export function fromBase32(input: string): Buffer {
  const cleaned = input.toUpperCase().replace(/=+$/, '').replace(/\s+/g, '');
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (let i = 0; i < cleaned.length; i++) {
    const idx = BASE32_ALPHABET.indexOf(cleaned[i]);
    if (idx === -1) {
      throw new Error(`Invalid Base32 character: ${cleaned[i]}`);
    }

    value = (value << 5) | idx;
    bits += 5;

    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

/**
 * Generates an RFC 6238 6-digit TOTP code from a Base32 secret for a specific epoch timestamp.
 */
export function generateTotp(secret: string, time = Date.now(), stepSeconds = 30): string {
  const key = fromBase32(secret);
  const counter = Math.floor(time / 1000 / stepSeconds);

  // Counter to 8-byte big-endian buffer
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigInt64BE(BigInt(counter), 0);

  const hmac = crypto.createHmac('sha1', key).update(counterBuffer).digest();

  // Dynamic truncation (RFC 4226)
  const offset = hmac[hmac.length - 1] & 0xf;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  const otp = binary % 1000000;
  return otp.toString().padStart(6, '0');
}

/**
 * Verifies a 6-digit TOTP code against a secret within a ±window drift.
 */
export function verifyTotp(token: string, secret: string, window = 1, time = Date.now()): boolean {
  if (!token || typeof token !== 'string') return false;
  const cleanedToken = token.trim();
  if (!/^\d{6}$/.test(cleanedToken)) return false;

  for (let step = -window; step <= window; step++) {
    const checkTime = time + step * 30 * 1000;
    if (generateTotp(secret, checkTime) === cleanedToken) {
      return true;
    }
  }

  return false;
}

/**
 * Generates a 20-byte cryptographically random Base32 secret & OTPAuth URL.
 */
export function generateSecret(accountEmail: string, issuer = 'NodePress'): {
  secret: string;
  otpauthUrl: string;
} {
  const randomBytes = crypto.randomBytes(20);
  const secret = toBase32(randomBytes);
  const encodedIssuer = encodeURIComponent(issuer);
  const encodedAccount = encodeURIComponent(accountEmail);
  const otpauthUrl = `otpauth://totp/${encodedIssuer}:${encodedAccount}?secret=${secret}&issuer=${encodedIssuer}&algorithm=SHA1&digits=6&period=30`;

  return { secret, otpauthUrl };
}

/**
 * Generates emergency backup recovery codes (e.g. "A7K2-9PQ4") and SHA-256 hashes.
 */
export function generateRecoveryCodes(count = 8): {
  codes: string[];
  hashedCodes: string[];
} {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // Unambiguous characters (no 0, 1, I, O)
  const codes: string[] = [];
  const hashedCodes: string[] = [];

  for (let i = 0; i < count; i++) {
    let part1 = '';
    let part2 = '';
    const bytes = crypto.randomBytes(8);
    for (let j = 0; j < 4; j++) part1 += chars[bytes[j] % chars.length];
    for (let j = 4; j < 8; j++) part2 += chars[bytes[j] % chars.length];
    const code = `${part1}-${part2}`;
    codes.push(code);

    const hash = crypto.createHash('sha256').update(code.toUpperCase()).digest('hex');
    hashedCodes.push(hash);
  }

  return { codes, hashedCodes };
}

/**
 * Validates and consumes a recovery code.
 */
export function verifyAndConsumeRecoveryCode(
  inputCode: string,
  storedHashedCodes: string[] = [],
): { valid: boolean; remainingHashes: string[] } {
  if (!inputCode || !Array.isArray(storedHashedCodes)) {
    return { valid: false, remainingHashes: storedHashedCodes || [] };
  }

  const normalized = inputCode.trim().toUpperCase();
  const inputHash = crypto.createHash('sha256').update(normalized).digest('hex');

  const matchIndex = storedHashedCodes.findIndex((h) => h === inputHash);
  if (matchIndex === -1) {
    return { valid: false, remainingHashes: storedHashedCodes };
  }

  const remainingHashes = storedHashedCodes.filter((_, idx) => idx !== matchIndex);
  return { valid: true, remainingHashes };
}
