import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FullAccessKeyOrJwtGuard } from './full-access-key-or-jwt.guard';

const ctxFor = (req: any) =>
  ({
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => ({}) }),
    getHandler: () => () => {},
    getClass: () => class {},
    getType: () => 'http',
  }) as any;

describe('FullAccessKeyOrJwtGuard', () => {
  const keys: Record<string, any> = {
    np_full: { name: 'ci', permissions: { access: 'all', contentTypes: ['*'] } },
    np_write: { name: 'w', permissions: { access: 'write', contentTypes: ['*'] } },
    np_read: { name: 'r', permissions: { access: 'read', contentTypes: ['*'] } },
    np_scoped: { name: 's', permissions: { access: 'all', contentTypes: ['blog'] } },
  };
  const guard = new FullAccessKeyOrJwtGuard({ validate: async (k: string) => keys[k] ?? null } as any, new Reflector(), {} as any);

  it('accepts an all-access key for every content type', async () => {
    const req: any = { headers: { 'x-api-key': 'np_full' } };
    await expect(guard.canActivate(ctxFor(req))).resolves.toBe(true);
    expect(req.apiKey.name).toBe('ci');
  });

  it.each(['np_write', 'np_read', 'np_scoped'])('refuses a narrower key (%s)', async (k) => {
    await expect(guard.canActivate(ctxFor({ headers: { 'x-api-key': k } }))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects an unknown key', async () => {
    await expect(guard.canActivate(ctxFor({ headers: { 'x-api-key': 'np_nope' } }))).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
