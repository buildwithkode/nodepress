import { Controller, Get, Global, Injectable, Module, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PluginRegistry, PluginManifest, compatibilityProblem } from './plugin.registry';
import { PluginHookBus } from './plugin-hook-bus';
import { PluginEvents } from './plugin.events';
import { PluginVetoError } from './plugin-veto.error';
import { PluginContextModule, InjectPluginContext, PluginContext, PLUGIN_CONTEXT } from './plugin-context';
import { PluginEnabledGuard, PluginRouteOwners } from './plugin-enabled.guard';
import { PluginService, SECRET_MASK, maskSecrets } from './plugin.service';
import { JobsService } from '../jobs/jobs.service';

const manifest = (id: string, extra: Partial<PluginManifest> = {}): PluginManifest => ({
  id,
  name: id,
  version: '1.0.0',
  description: id,
  permissions: ['entries:read', 'entries:write'],
  ...extra,
});

const register = (registry: PluginRegistry, m: PluginManifest, enabled = true) =>
  registry.register({ manifest: m, module: class {}, enabled, config: {} });

describe('Plugin SDK', () => {
  let registry: PluginRegistry;
  let bus: PluginHookBus;

  beforeEach(() => {
    registry = new PluginRegistry();
    bus = new PluginHookBus(registry);
  });

  describe('veto', () => {
    it('a before-hook throwing PluginVetoError rejects the write and stops later hooks', async () => {
      register(registry, manifest('guard'));
      let laterRan = false;
      bus.on(PluginEvents.ENTRY_BEFORE_CREATE, () => { throw new PluginVetoError('Price must be positive'); }, 5, 'guard');
      bus.on(PluginEvents.ENTRY_BEFORE_CREATE, () => { laterRan = true; }, 20);

      const err = await bus.emit(PluginEvents.ENTRY_BEFORE_CREATE, { data: {} }).catch((e) => e);
      expect(err).toBeInstanceOf(PluginVetoError);
      expect(err.getStatus()).toBe(422);
      expect(err.message).toBe('Price must be positive');
      expect(err.pluginId).toBe('guard'); // attributed to the vetoing plugin
      expect(laterRan).toBe(false);
    });

    it('ordinary errors are still swallowed', async () => {
      bus.on(PluginEvents.ENTRY_BEFORE_CREATE, () => { throw new Error('bug'); });
      await expect(bus.emit(PluginEvents.ENTRY_BEFORE_CREATE, {})).resolves.toBeUndefined();
    });

    it("a disabled plugin can't veto", async () => {
      register(registry, manifest('off'), false);
      bus.on(PluginEvents.ENTRY_BEFORE_CREATE, () => { throw new PluginVetoError('no'); }, 10, 'off');
      await expect(bus.emit(PluginEvents.ENTRY_BEFORE_CREATE, {})).resolves.toBeUndefined();
    });
  });

  describe('compatibility', () => {
    it('checks the manifest "nodepress" range against the core version', () => {
      expect(compatibilityProblem(manifest('a'), '2.0.0')).toBeNull();
      expect(compatibilityProblem(manifest('a', { nodepress: '^2.0.0' }), '2.3.1')).toBeNull();
      expect(compatibilityProblem(manifest('a', { nodepress: '^3.0.0' }), '2.3.1')).toMatch(/Requires NodePress \^3\.0\.0/);
      expect(compatibilityProblem(manifest('a', { nodepress: 'not a range' }), '2.3.1')).toMatch(/Invalid/);
    });

    it('an incompatible plugin registers disabled, stays disabled after a DB sync, and cannot be enabled', () => {
      register(registry, manifest('future', { nodepress: '>=999.0.0' }));
      expect(registry.isEnabled('future')).toBe(false);
      expect(registry.get('future')?.incompatible).toMatch(/Requires NodePress/);
      registry.syncWithDb([{ id: 'future', enabled: true }]);
      expect(registry.isEnabled('future')).toBe(false);
      expect(registry.enable('future')).toBe(false);
      expect(registry.isEnabled('future')).toBe(false);
    });
  });

  describe('PluginContext', () => {
    @Injectable()
    class AlphaService {
      constructor(@InjectPluginContext() readonly ctx: PluginContext) {}
    }
    @Module({ imports: [PluginContextModule.forPlugin(manifest('alpha', { defaultConfig: { n: 1 } }))], providers: [AlphaService] })
    class AlphaModule {}

    @Injectable()
    class BetaService {
      constructor(@InjectPluginContext() readonly ctx: PluginContext) {}
    }
    @Module({ imports: [PluginContextModule.forPlugin(manifest('beta', { permissions: ['entries:read', 'jobs:run'] }))], providers: [BetaService] })
    class BetaModule {}

    const jobs = { registerHandler: jest.fn(), enqueue: jest.fn().mockResolvedValue(7) };

    async function boot() {
      // Stands in for the global PluginModule / JobsModule.
      @Global()
      @Module({
        providers: [
          { provide: PluginRegistry, useValue: registry },
          { provide: PluginHookBus, useValue: bus },
          { provide: JobsService, useValue: jobs },
        ],
        exports: [PluginRegistry, PluginHookBus, JobsService],
      })
      class CoreStub {}
      const moduleRef = await Test.createTestingModule({ imports: [CoreStub, AlphaModule, BetaModule] }).compile();
      return { alpha: moduleRef.get(AlphaService).ctx, beta: moduleRef.get(BetaService).ctx };
    }

    beforeEach(() => {
      jobs.registerHandler.mockClear();
      jobs.enqueue.mockClear();
    });

    it('gives each plugin its own context (forPlugin modules are not deduplicated)', async () => {
      const { alpha, beta } = await boot();
      expect(alpha.id).toBe('alpha');
      expect(beta.id).toBe('beta');
      expect(alpha).not.toBe(beta);
    });

    it('hooks are registered under the plugin id and skipped while it is disabled', async () => {
      register(registry, manifest('alpha'));
      const { alpha } = await boot();
      const seen: any[] = [];
      alpha.on(PluginEvents.ENTRY_BEFORE_CREATE, (p) => { seen.push(p); });
      await bus.emit(PluginEvents.ENTRY_BEFORE_CREATE, { a: 1 });
      registry.disable('alpha');
      await bus.emit(PluginEvents.ENTRY_BEFORE_CREATE, { a: 2 });
      expect(seen).toEqual([{ a: 1 }]);
    });

    it('refuses to subscribe to an event the manifest has no permission for', async () => {
      const { beta } = await boot(); // beta has entries:read only
      expect(() => beta.on(PluginEvents.ENTRY_BEFORE_UPDATE, () => {})).toThrow(/needs the "entries:write" permission/);
      expect(() => beta.on(PluginEvents.ENTRY_AFTER_UPDATE, () => {})).not.toThrow();
      expect(() => beta.on(PluginEvents.ENTRY_BEFORE_DELETE, () => {})).toThrow(/entries:delete/);
    });

    it('reads only its own config and is told about changes', async () => {
      register(registry, manifest('alpha', { defaultConfig: { n: 1 } }));
      register(registry, manifest('beta'));
      registry.setConfig('beta', { secret: 'x' });
      const { alpha } = await boot();
      const changes: any[] = [];
      alpha.onConfigChange((c) => changes.push(c));
      expect(alpha.config()).toEqual({ n: 1 });
      registry.setConfig('alpha', { n: 2 });
      expect(alpha.config()).toEqual({ n: 2 });
      expect(changes).toEqual([{ n: 2 }]);
    });

    it('namespaces jobs, requires jobs:run, and fails queued jobs while disabled', async () => {
      register(registry, manifest('beta', { permissions: ['entries:read', 'jobs:run'] }));
      const { alpha, beta } = await boot();
      expect(() => alpha.jobs.register('x', async () => {})).toThrow(/jobs:run/);

      const handler = jest.fn();
      beta.jobs.register('sync', handler);
      expect(jobs.registerHandler).toHaveBeenCalledWith('beta.sync', expect.any(Function));
      await expect(beta.jobs.enqueue('sync', { a: 1 })).resolves.toBe(7);
      expect(jobs.enqueue).toHaveBeenCalledWith('beta.sync', { a: 1 }, undefined);

      const wrapped = jobs.registerHandler.mock.calls[0][1];
      await wrapped({ a: 1 }, {} as any);
      expect(handler).toHaveBeenCalledTimes(1);
      registry.disable('beta');
      await expect(wrapped({ a: 1 }, {} as any)).rejects.toThrow(/disabled/);
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('is exported under PLUGIN_CONTEXT', () => {
      expect(typeof PLUGIN_CONTEXT).toBe('symbol');
    });
  });

  describe('route gating', () => {
    @Controller('shop')
    class ShopController {
      @Get() list() { return []; }
    }
    @Controller('core')
    class CoreController {}

    const ctxFor = (cls: any) => ({ getClass: () => cls }) as any;

    it("answers 404 for a disabled plugin's controllers and leaves others alone", () => {
      register(registry, manifest('shop'));
      const owners = new PluginRouteOwners();
      owners.set(ShopController, 'shop');
      const guard = new PluginEnabledGuard(owners, registry);

      expect(guard.canActivate(ctxFor(ShopController))).toBe(true);
      registry.disable('shop');
      expect(() => guard.canActivate(ctxFor(ShopController))).toThrow(NotFoundException);
      expect(guard.canActivate(ctxFor(CoreController))).toBe(true);
    });
  });

  describe('settings secrets', () => {
    const secretManifest = manifest('pay', {
      configSchema: [
        { name: 'apiKey', label: 'API key', type: 'password' },
        { name: 'mode', label: 'Mode', type: 'text' },
      ] as any,
    });

    function service() {
      const prisma = { installedPlugin: { upsert: jest.fn().mockResolvedValue({}), findMany: jest.fn().mockResolvedValue([]) } };
      const audit = { log: jest.fn().mockResolvedValue(undefined) };
      return { svc: new PluginService(prisma as any, registry, bus, audit as any), prisma, audit };
    }

    it('masks password-type settings and hides settings from non-admins', () => {
      register(registry, secretManifest);
      registry.setConfig('pay', { apiKey: 'sk_live_123', mode: 'live' });
      expect(maskSecrets(registry.get('pay')!)).toEqual({ apiKey: SECRET_MASK, mode: 'live' });

      const { svc } = service();
      expect(svc.getPlugin('pay', 'admin').config).toEqual({ apiKey: SECRET_MASK, mode: 'live' });
      const editorView = svc.getPlugin('pay', 'editor');
      expect(editorView.config).toEqual({});
      expect(editorView.configSchema).toEqual([]);
      expect(JSON.stringify(svc.listPlugins('editor'))).not.toContain('sk_live_123');
    });

    it('saving the mask back keeps the stored secret, and the audit log gets keys only', async () => {
      register(registry, secretManifest);
      registry.setConfig('pay', { apiKey: 'sk_live_123', mode: 'live' });
      const { svc, prisma, audit } = service();

      await svc.updatePluginConfig('pay', { apiKey: SECRET_MASK, mode: 'test' });
      expect(registry.getConfig('pay')).toEqual({ apiKey: 'sk_live_123', mode: 'test' });
      expect(prisma.installedPlugin.upsert.mock.calls[0][0].update.config.apiKey).toBe('sk_live_123');
      expect(JSON.stringify(audit.log.mock.calls)).not.toContain('sk_live_123');
      expect(audit.log.mock.calls[0][4]).toEqual({ id: 'pay', changedKeys: ['mode'] });

      await svc.updatePluginConfig('pay', { apiKey: 'sk_live_456' });
      expect(registry.getConfig('pay').apiKey).toBe('sk_live_456');
    });

    it("toggling an incompatible plugin on is a 400", async () => {
      register(registry, manifest('old', { nodepress: '<0.0.1' }));
      const { svc } = service();
      await expect(svc.togglePlugin('old', true)).rejects.toThrow(/can't be enabled/);
    });
  });
});
