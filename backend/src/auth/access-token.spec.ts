import { UnauthorizedException } from '@nestjs/common';
import { isAccessTokenPayload } from './access-token';
import { JwtStrategy } from './strategies/jwt.strategy';

describe('isAccessTokenPayload', () => {
  it('accepts an access token payload', () => {
    expect(isAccessTokenPayload({ sub: 1, email: 'a@b.co', iat: 1, exp: 2 })).toBe(true);
  });

  it.each([
    ['2FA temp token', { sub: 1, email: 'a@b.co', purpose: '2fa_pending' }],
    ['OIDC state cookie', { state: 's', nonce: 'n', verifier: 'v', purpose: 'oidc_login' }],
    ['preview token', { sub: 'preview', entryId: 1, publicId: 'x' }],
    ['empty', null],
  ])('refuses a %s', (_name, payload) => {
    expect(isAccessTokenPayload(payload)).toBe(false);
  });
});

describe('JwtStrategy.validate', () => {
  const user = { id: 1, email: 'a@b.co', role: 'admin' };
  const prisma = { user: { findUnique: jest.fn().mockResolvedValue(user) } };
  const roles = { resolve: jest.fn().mockResolvedValue({ role: 'admin' }) };
  const strategy = new JwtStrategy(prisma as any, roles as any);

  beforeEach(() => prisma.user.findUnique.mockClear());

  it('refuses the 2FA temp token without looking the user up', async () => {
    await expect(strategy.validate({ sub: 1, email: 'a@b.co', purpose: '2fa_pending' } as any))
      .rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('returns the user for an access token', async () => {
    await expect(strategy.validate({ sub: 1, email: 'a@b.co' })).resolves.toEqual({ id: 1, email: 'a@b.co', role: 'admin' });
  });
});
