import {
  toBase32,
  fromBase32,
  generateSecret,
  generateTotp,
  verifyTotp,
  generateRecoveryCodes,
  verifyAndConsumeRecoveryCode,
} from './totp.util';

describe('TOTP Utility (RFC 6238)', () => {
  it('should encode and decode base32 reversibly', () => {
    const raw = Buffer.from('NodePress CMS 2FA Test String!');
    const base32 = toBase32(raw);
    const decoded = fromBase32(base32);
    expect(decoded.toString()).toBe('NodePress CMS 2FA Test String!');
  });

  it('should generate valid Base32 secret and OTPAuth URI', () => {
    const { secret, otpauthUrl } = generateSecret('admin@nodepress.io', 'NodePress');
    expect(secret).toHaveLength(32);
    expect(otpauthUrl).toContain('otpauth://totp/NodePress:admin%40nodepress.io');
    expect(otpauthUrl).toContain(`secret=${secret}`);
  });

  it('should generate and verify 6-digit TOTP codes', () => {
    const { secret } = generateSecret('user@test.com');
    const now = Date.now();
    const token = generateTotp(secret, now);

    expect(token).toMatch(/^\d{6}$/);
    expect(verifyTotp(token, secret, 1, now)).toBe(true);
  });

  it('should accept codes within time-drift window (±30s)', () => {
    const { secret } = generateSecret('user@test.com');
    const now = Date.now();
    const pastToken = generateTotp(secret, now - 30 * 1000); // 30s ago
    const futureToken = generateTotp(secret, now + 30 * 1000); // 30s ahead
    const tooFarToken = generateTotp(secret, now - 90 * 1000); // 90s ago

    expect(verifyTotp(pastToken, secret, 1, now)).toBe(true);
    expect(verifyTotp(futureToken, secret, 1, now)).toBe(true);
    expect(verifyTotp(tooFarToken, secret, 1, now)).toBe(false);
  });

  it('should generate, verify, and consume emergency recovery codes', () => {
    const { codes, hashedCodes } = generateRecoveryCodes(8);
    expect(codes).toHaveLength(8);
    expect(hashedCodes).toHaveLength(8);

    const firstCode = codes[0];
    const result1 = verifyAndConsumeRecoveryCode(firstCode, hashedCodes);
    expect(result1.valid).toBe(true);
    expect(result1.remainingHashes).toHaveLength(7);

    // Second use of the same code must fail
    const result2 = verifyAndConsumeRecoveryCode(firstCode, result1.remainingHashes);
    expect(result2.valid).toBe(false);
  });
});
