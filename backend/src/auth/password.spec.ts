import * as bcrypt from 'bcryptjs';
import { createHash } from 'crypto';
import {
  BCRYPT_ROUNDS, assertAcceptablePassword, breachCheckEnabled, hashPassword, isBreachedPassword,
  needsRehash, unusablePasswordHash, verifyAgainstDummy, verifyPassword,
} from './password';
import { TOKEN_HASH_PREFIX, hashToken } from './token-hash';
import { isCurrentSession } from './access-token';
import { isSealedTotpSecret, readTotpSecret, sealTotpSecret } from './totp-secret';

describe('password hashing', () => {
  it('hashes at the current cost and verifies', async () => {
    const hash = await hashPassword('a-long-passphrase');
    expect(bcrypt.getRounds(hash)).toBe(BCRYPT_ROUNDS);
    expect(await verifyPassword('a-long-passphrase', hash)).toBe(true);
    expect(await verifyPassword('wrong-passphrase', hash)).toBe(false);
  });

  it('asks to rehash hashes made with a lower cost only', async () => {
    expect(needsRehash(bcrypt.hashSync('x', 10))).toBe(true);
    expect(needsRehash(await hashPassword('x'))).toBe(false);
    expect(needsRehash('not a hash')).toBe(false);
  });

  it('never throws on a malformed stored hash', async () => {
    expect(await verifyPassword('anything', 'garbage')).toBe(false);
    expect(await verifyPassword(undefined as any, 'garbage')).toBe(false);
  });

  it('unusable passwords are real bcrypt hashes nobody can match', async () => {
    const hash = await unusablePasswordHash();
    expect(hash.startsWith('$2')).toBe(true);
    expect(await verifyPassword('', hash)).toBe(false);
  });

  it('the no-account comparison always fails', async () => {
    expect(await verifyAgainstDummy('anything')).toBe(false);
  });
});

describe('assertAcceptablePassword()', () => {
  it('accepts a reasonable password', async () => {
    await expect(assertAcceptablePassword('Blue-Mango-Kite-42', 'me@example.com')).resolves.toBeUndefined();
  });

  it.each([
    ['short1', 'metheuser@example.com', /at least 8/],
    ['x'.repeat(129), 'metheuser@example.com', /at most 128/],
    ['password123', 'metheuser@example.com', /too common/],
    ['PASSWORD123', 'metheuser@example.com', /too common/],
    ['aaaaaaaaaa', 'metheuser@example.com', /too common/],
    ['metheuser@example.com', 'metheuser@example.com', /email address/],
    ['MeTheUser', 'metheuser@example.com', /email address/],
  ])('refuses %s', async (pw, email, message) => {
    await expect(assertAcceptablePassword(pw, email)).rejects.toThrow(message);
  });
});

describe('breached-password check', () => {
  const original = process.env.PASSWORD_BREACH_CHECK;
  afterEach(() => {
    if (original === undefined) delete process.env.PASSWORD_BREACH_CHECK;
    else process.env.PASSWORD_BREACH_CHECK = original;
  });

  const sha1 = (s: string) => createHash('sha1').update(s).digest('hex').toUpperCase();
  const respond = (body: string, ok = true) =>
    jest.fn(async () => ({ ok, status: ok ? 200 : 503, text: async () => body })) as unknown as typeof fetch;

  it('is off in tests unless turned on', () => {
    delete process.env.PASSWORD_BREACH_CHECK;
    expect(breachCheckEnabled()).toBe(false);
    process.env.PASSWORD_BREACH_CHECK = 'true';
    expect(breachCheckEnabled()).toBe(true);
    process.env.PASSWORD_BREACH_CHECK = 'false';
    expect(breachCheckEnabled()).toBe(false);
  });

  it('sends only the first 5 characters of the SHA-1 hash and finds a match', async () => {
    process.env.PASSWORD_BREACH_CHECK = 'true';
    const hash = sha1('hunter2hunter2');
    const fetchImpl = respond(`0000000000000000000000000000000000A:0\r\n${hash.slice(5)}:42\r\n`);
    expect(await isBreachedPassword('hunter2hunter2', fetchImpl)).toBe(true);
    const url = (fetchImpl as unknown as jest.Mock).mock.calls[0][0] as string;
    expect(url).toBe(`https://api.pwnedpasswords.com/range/${hash.slice(0, 5)}`);
    expect(url).not.toContain('hunter2');
  });

  it('ignores padding rows with a count of 0', async () => {
    process.env.PASSWORD_BREACH_CHECK = 'true';
    const hash = sha1('padded-only-pass');
    expect(await isBreachedPassword('padded-only-pass', respond(`${hash.slice(5)}:0\n`))).toBe(false);
  });

  it('allows the password when the service fails or is unreachable', async () => {
    process.env.PASSWORD_BREACH_CHECK = 'true';
    expect(await isBreachedPassword('whatever-pass', respond('', false))).toBe(false);
    const failing = jest.fn(async () => { throw new Error('offline'); }) as unknown as typeof fetch;
    expect(await isBreachedPassword('whatever-pass', failing)).toBe(false);
  });

  it('is not called when turned off', async () => {
    process.env.PASSWORD_BREACH_CHECK = 'false';
    const fetchImpl = respond('');
    expect(await isBreachedPassword('whatever-pass', fetchImpl)).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('hashToken()', () => {
  it('is a prefixed SHA-256, the same as the migration computes', () => {
    expect(hashToken('np_abc123')).toBe(
      'sha256:9634ef193a6fee80cab7684840e558dd8efb221ae02424d28f17a1d8eb07dd35',
    );
    expect(hashToken('x').startsWith(TOKEN_HASH_PREFIX)).toBe(true);
  });
});

describe('isCurrentSession()', () => {
  it('matches the token to the user session version', () => {
    expect(isCurrentSession({ sub: 1, email: 'a', sv: 2 }, { sessionVersion: 2 })).toBe(true);
    expect(isCurrentSession({ sub: 1, email: 'a', sv: 1 }, { sessionVersion: 2 })).toBe(false);
  });

  it('treats tokens signed before session versions existed as version 0', () => {
    expect(isCurrentSession({ sub: 1, email: 'a' }, { sessionVersion: 0 })).toBe(true);
    expect(isCurrentSession({ sub: 1, email: 'a' }, { sessionVersion: 1 })).toBe(false);
  });
});

describe('2FA secret storage', () => {
  it('encrypts and reads back, and still reads a plain legacy secret', () => {
    const sealed = sealTotpSecret('JBSWY3DPEHPK3PXP');
    expect(isSealedTotpSecret(sealed)).toBe(true);
    expect(sealed).not.toContain('JBSWY3DPEHPK3PXP');
    expect(readTotpSecret(sealed)).toBe('JBSWY3DPEHPK3PXP');
    expect(readTotpSecret('JBSWY3DPEHPK3PXP')).toBe('JBSWY3DPEHPK3PXP');
    expect(readTotpSecret(null)).toBeNull();
  });

  it('returns null for a tampered secret', () => {
    const sealed = sealTotpSecret('JBSWY3DPEHPK3PXP');
    expect(readTotpSecret(sealed.slice(0, -4) + 'AAAA')).toBeNull();
  });
});
