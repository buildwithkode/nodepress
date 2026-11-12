import * as bcrypt from 'bcryptjs';
import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { hashToken } from './token-hash';
import { isSealedTotpSecret, readTotpSecret, sealTotpSecret } from './totp-secret';
import { generateTotp } from './totp.util';

/** Sign-in hardening: hash upgrade, hashed tokens, session versions, encrypted 2FA secrets. */
function setup() {
  const prisma: any = {
    user: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    refreshToken: {
      create: jest.fn(),
      findUnique: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
    passwordResetToken: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    $transaction: jest.fn(async (ops: any[]) => Promise.all(ops)),
  };
  const jwt: any = { sign: jest.fn((payload: any) => `token:${JSON.stringify(payload)}`), verify: jest.fn() };
  const mail: any = { sendPasswordReset: jest.fn().mockResolvedValue(undefined) };
  const roles: any = { resolve: jest.fn(async (role: string) => ({ role })) };
  const res: any = { cookie: jest.fn(), clearCookie: jest.fn() };
  return { prisma, jwt, res, service: new AuthService(prisma, jwt, mail, roles), mail };
}

const signed = (jwt: any, call = 0) => jwt.sign.mock.calls[call][0];

describe('AuthService sign-in hardening', () => {
  it('upgrades a weaker password hash on a successful login', async () => {
    const { prisma, service, res } = setup();
    const old = bcrypt.hashSync('Blue-Mango-Kite-42', 10);
    prisma.user.findUnique.mockResolvedValue({ id: 1, email: 'a@test.com', role: 'admin', password: old, sessionVersion: 0 });

    await service.login({ email: 'a@test.com', password: 'Blue-Mango-Kite-42' }, res);

    const call = prisma.user.updateMany.mock.calls[0][0];
    expect(call.where).toEqual({ id: 1, password: old });
    expect(bcrypt.getRounds(call.data.password)).toBe(12);
    expect(bcrypt.compareSync('Blue-Mango-Kite-42', call.data.password)).toBe(true);
  });

  it('still signs in when the upgrade fails', async () => {
    const { prisma, service, res } = setup();
    prisma.user.findUnique.mockResolvedValue({
      id: 1, email: 'a@test.com', role: 'admin', password: bcrypt.hashSync('Blue-Mango-Kite-42', 10), sessionVersion: 0,
    });
    prisma.user.updateMany.mockRejectedValue(new Error('db down'));
    const result: any = await service.login({ email: 'a@test.com', password: 'Blue-Mango-Kite-42' }, res);
    expect(result.access_token).toBeDefined();
  });

  it('signs the session version into the access token and stores only the refresh token hash', async () => {
    const { prisma, jwt, service, res } = setup();
    prisma.user.findUnique.mockResolvedValue({
      id: 1, email: 'a@test.com', role: 'admin', password: bcrypt.hashSync('Blue-Mango-Kite-42', 4), sessionVersion: 3,
    });

    await service.login({ email: 'a@test.com', password: 'Blue-Mango-Kite-42' }, res);

    expect(signed(jwt)).toEqual({ sub: 1, email: 'a@test.com', sv: 3 });
    const cookieValue = res.cookie.mock.calls[0][1];
    expect(prisma.refreshToken.create.mock.calls[0][0].data.token).toBe(hashToken(cookieValue));
  });

  it('looks a refresh cookie up by its hash', async () => {
    const { prisma, service, res } = setup();
    prisma.refreshToken.findUnique.mockResolvedValue({ id: 5, userId: 1, expiresAt: new Date(Date.now() + 60_000) });
    prisma.user.findUnique.mockResolvedValue({ id: 1, email: 'a@test.com', sessionVersion: 0 });

    await service.refresh('raw-cookie', res);
    expect(prisma.refreshToken.findUnique).toHaveBeenCalledWith({ where: { token: hashToken('raw-cookie') } });
  });

  it('a reset link token is stored hashed, and resetting signs out everywhere', async () => {
    const { prisma, mail, service } = setup();
    prisma.user.findUnique.mockResolvedValue({ id: 1, email: 'a@test.com' });
    await service.forgotPassword('a@test.com');
    const link = new URL(mail.sendPasswordReset.mock.calls[0][1]);
    const raw = link.searchParams.get('token')!;
    expect(prisma.passwordResetToken.create.mock.calls[0][0].data.token).toBe(hashToken(raw));

    prisma.passwordResetToken.findUnique.mockResolvedValue({ id: 9, userId: 1, used: false, expiresAt: new Date(Date.now() + 60_000) });
    await service.resetPassword(raw, 'Blue-Mango-Kite-42');
    expect(prisma.passwordResetToken.findUnique).toHaveBeenCalledWith({ where: { token: hashToken(raw) } });
    const update = prisma.user.update.mock.calls[0][0];
    expect(update.data.sessionVersion).toEqual({ increment: 1 });
    expect(bcrypt.getRounds(update.data.password)).toBe(12);
    expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({ where: { userId: 1 } });
  });

  it('refuses a common password on reset without using up the link', async () => {
    const { prisma, service } = setup();
    prisma.passwordResetToken.findUnique.mockResolvedValue({ id: 9, userId: 1, used: false, expiresAt: new Date(Date.now() + 60_000) });
    prisma.user.findUnique.mockResolvedValue({ email: 'a@test.com' });
    await expect(service.resetPassword('raw', 'qwerty123')).rejects.toThrow(/too common/);
    expect(prisma.passwordResetToken.update).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('sign out everywhere moves the session version on and deletes every refresh token', async () => {
    const { prisma, service, res } = setup();
    await service.logoutEverywhere(1, res);
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { sessionVersion: { increment: 1 } } });
    expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({ where: { userId: 1 } });
    expect(res.clearCookie).toHaveBeenCalled();
  });

  it('enabling 2FA stores the secret encrypted, ends other sessions and returns a new token', async () => {
    const { prisma, jwt, service } = setup();
    const secret = 'JBSWY3DPEHPK3PXP';
    prisma.user.update.mockResolvedValue({ id: 1, email: 'a@test.com', sessionVersion: 4 });

    const result: any = await service.enable2fa(1, secret, generateTotp(secret), ['h1'], 'my-cookie');

    const data = prisma.user.update.mock.calls[0][0].data;
    expect(isSealedTotpSecret(data.twoFactorSecret)).toBe(true);
    expect(readTotpSecret(data.twoFactorSecret)).toBe(secret);
    expect(data.sessionVersion).toEqual({ increment: 1 });
    expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({ where: { userId: 1, token: { not: hashToken('my-cookie') } } });
    expect(result.access_token).toBeDefined();
    expect(signed(jwt).sv).toBe(4);
  });

  it('a 2FA login accepts both an encrypted and a legacy plain secret', async () => {
    const secret = 'JBSWY3DPEHPK3PXP';
    for (const stored of [sealTotpSecret(secret), secret]) {
      const { prisma, jwt, service, res } = setup();
      jwt.verify.mockReturnValue({ sub: 1, purpose: '2fa_pending' });
      prisma.user.findUnique.mockResolvedValue({ id: 1, email: 'a@test.com', role: 'admin', twoFactorSecret: stored, sessionVersion: 0 });
      const result: any = await service.verify2faLogin('temp', generateTotp(secret), res);
      expect(result.access_token).toBeDefined();
    }
  });

  it('encrypts plain 2FA secrets at startup, leaving encrypted ones alone', async () => {
    const { prisma, service } = setup();
    const already = sealTotpSecret('AAAA');
    prisma.user.findMany.mockResolvedValue([
      { id: 1, twoFactorSecret: 'JBSWY3DPEHPK3PXP' },
      { id: 2, twoFactorSecret: already },
    ]);
    await service.onModuleInit();
    expect(prisma.user.updateMany).toHaveBeenCalledTimes(1);
    const call = prisma.user.updateMany.mock.calls[0][0];
    expect(call.where).toEqual({ id: 1, twoFactorSecret: 'JBSWY3DPEHPK3PXP' });
    expect(readTotpSecret(call.data.twoFactorSecret)).toBe('JBSWY3DPEHPK3PXP');
  });

  it('startup encryption never throws', async () => {
    const { prisma, service } = setup();
    prisma.user.findMany.mockRejectedValue(new Error('no table'));
    await expect(service.onModuleInit()).resolves.toBeUndefined();
  });
});

describe('JwtStrategy session version', () => {
  it('refuses a token from an ended session', async () => {
    const prisma: any = { user: { findUnique: jest.fn().mockResolvedValue({ id: 1, email: 'a', role: 'admin', sessionVersion: 2 }) } };
    const roles: any = { resolve: jest.fn(async (role: string) => ({ role })) };
    const strategy = new JwtStrategy(prisma, roles);
    await expect(strategy.validate({ sub: 1, email: 'a', sv: 1 })).rejects.toThrow(UnauthorizedException);
    await expect(strategy.validate({ sub: 1, email: 'a', sv: 2 })).resolves.toMatchObject({ id: 1 });
  });
});
