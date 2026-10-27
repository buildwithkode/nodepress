import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AccessService } from './access.service';
import { contentActions, contentLevel, levelAllows } from './access-modules';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ACCESS_KEY } from '../auth/decorators/access.decorator';

// Custom roles known to the mock: reviewer → contributor.
const CUSTOM: Record<string, string> = { reviewer: 'contributor' };

function setup(opts: { access?: any[]; permissions?: any[]; plugins?: any[] } = {}) {
  const store = new Map<string, any>();
  const prisma = {
    roleAccess: {
      findMany: jest.fn(async ({ where }) => (opts.access ?? []).filter((r) => r.role === where.role)),
      upsert: jest.fn((args) => args),
      deleteMany: jest.fn(),
    },
    permission: {
      findMany: jest.fn(async ({ where }) => (opts.permissions ?? []).filter((r) => where.role.in.includes(r.role))),
    },
    role: { findMany: jest.fn(async () => Object.keys(CUSTOM).map((name) => ({ name }))) },
    $transaction: jest.fn(async (ops: any[]) => ops),
  };
  const cache = {
    get: jest.fn(async (k: string) => store.get(k)),
    set: jest.fn(async (k: string, v: any) => { store.set(k, v); }),
    invalidatePrefix: jest.fn(async (p: string) => { for (const k of store.keys()) if (k.startsWith(p)) store.delete(k); }),
  };
  const roles = {
    exists: jest.fn(async (n: string) => ['editor', 'contributor', 'viewer'].includes(n) || n in CUSTOM),
    lookupBaseRole: jest.fn(async (n: string) => CUSTOM[n] ?? null),
  };
  const plugins = { getEnabled: () => opts.plugins ?? [] };
  const service = new AccessService(prisma as any, cache as any, roles as any, plugins as any);
  return { service, prisma, cache };
}

describe('access-modules helpers', () => {
  it('orders levels none < view < edit', () => {
    expect(levelAllows('edit', 'view')).toBe(true);
    expect(levelAllows('view', 'edit')).toBe(false);
    expect(levelAllows('none', 'view')).toBe(false);
  });

  it('maps content actions to a level and back', () => {
    expect(contentLevel(['read'])).toBe('view');
    expect(contentLevel(['create', 'read', 'update'])).toBe('edit');
    expect(contentLevel([])).toBe('none');
    expect(contentActions('edit', { publish: true })).toEqual(['create', 'read', 'update', 'publish']);
    expect(contentActions('view', { publish: true })).toEqual(['read']);
  });
});

describe('AccessService', () => {
  it('gives built-in roles their defaults when nothing is saved', async () => {
    const { service } = setup();
    expect((await service.forRole('editor')).modules).toMatchObject({ media: 'edit', forms: 'edit', users: 'none', content: 'edit' });
    expect((await service.forRole('contributor')).modules).toMatchObject({ media: 'view', forms: 'none', content: 'edit' });
    expect((await service.forRole('viewer')).modules).toMatchObject({ media: 'view', content: 'view' });
  });

  it('saved rows win; a custom role starts from its base role', async () => {
    const { service } = setup({ access: [{ role: 'reviewer', module: 'forms', level: 'view' }] });
    const { modules } = await service.forRole('reviewer');
    expect(modules.forms).toBe('view');      // saved
    expect(modules.media).toBe('view');      // contributor default
  });

  it('derives content from the permission rows, falling back to the base role', async () => {
    const { service } = setup({
      permissions: [
        { role: 'contributor', contentType: '*', actions: ['create', 'read', 'update'] },
        { role: 'reviewer', contentType: 'blog', actions: ['read'] },
      ],
    });
    const { modules, content } = await service.forRole('reviewer');
    expect(content.blog).toEqual(['read']);
    expect(content['*']).toEqual(['create', 'read', 'update']);
    expect(modules.content).toBe('edit');
  });

  it('admin is allowed everything without a lookup', async () => {
    const { service, prisma } = setup();
    expect(await service.allows({ role: 'admin' }, 'users', 'edit')).toBe(true);
    expect(prisma.roleAccess.findMany).not.toHaveBeenCalled();
  });

  it('checks the custom role, not the base role', async () => {
    const { service } = setup({ access: [{ role: 'reviewer', module: 'users', level: 'view' }] });
    expect(await service.allows({ role: 'contributor', customRole: 'reviewer' }, 'users', 'view')).toBe(true);
    expect(await service.allows({ role: 'contributor', customRole: 'reviewer' }, 'users', 'edit')).toBe(false);
    expect(await service.allows({ role: 'contributor' }, 'users', 'view')).toBe(false);
  });

  it('adds modules from enabled plugins with their defaults', async () => {
    const { service } = setup({
      plugins: [{ manifest: { id: 'shop', adminModules: [{ key: 'commerce', label: 'Commerce', defaults: { editor: 'edit' } }] } }],
    });
    expect(service.modules().find((m) => m.key === 'commerce')).toMatchObject({ plugin: 'shop' });
    expect((await service.forRole('editor')).modules.commerce).toBe('edit');
    expect((await service.forRole('viewer')).modules.commerce).toBe('none');
  });

  it('saves levels and clears the cache', async () => {
    const { service, prisma, cache } = setup();
    await service.set('editor', { users: 'view' });
    expect(prisma.roleAccess.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { role_module: { role: 'editor', module: 'users' } },
      create: { role: 'editor', module: 'users', level: 'view' },
    }));
    expect(cache.invalidatePrefix).toHaveBeenCalledWith('access:');
  });

  it('refuses admin, unknown roles and modules, bad levels and content', async () => {
    const { service } = setup();
    await expect(service.set('admin', { users: 'view' })).rejects.toThrow(NotFoundException);
    await expect(service.set('ghost', { users: 'view' })).rejects.toThrow(NotFoundException);
    await expect(service.set('editor', { nope: 'view' })).rejects.toThrow(BadRequestException);
    await expect(service.set('editor', { users: 'all' })).rejects.toThrow(BadRequestException);
    await expect(service.set('editor', { content: 'edit' })).rejects.toThrow(BadRequestException);
  });
});

describe('RolesGuard with @Access', () => {
  const ctxFor = (user: any) => ({
    getHandler: () => null, getClass: () => null, getType: () => 'http',
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  }) as any;

  it('lets a role with enough access through and refuses one without', async () => {
    const reflector = new Reflector();
    jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key: any) =>
      key === ACCESS_KEY ? { module: 'media', level: 'edit' } : undefined);
    const { service } = setup();
    const guard = new RolesGuard(reflector, service);
    await expect(guard.canActivate(ctxFor({ role: 'editor' }))).resolves.toBe(true);
    await expect(guard.canActivate(ctxFor({ role: 'viewer' }))).rejects.toThrow(ForbiddenException);
    await expect(guard.canActivate(ctxFor({ role: 'admin' }))).resolves.toBe(true);
  });
});
