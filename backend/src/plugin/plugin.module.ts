import { Global, Logger, Module, OnModuleInit, Type } from '@nestjs/common';
import { APP_GUARD, ModulesContainer } from '@nestjs/core';
import { Module as NestModuleRef } from '@nestjs/core/injector/module';
import { PluginEnabledGuard, PluginRouteOwners } from './plugin-enabled.guard';
import { PluginRegistry } from './plugin.registry';
import { PluginHookBus } from './plugin-hook-bus';
import { PluginService } from './plugin.service';
import { PluginApiController } from './plugin-api.controller';
import { loadedPlugins, PluginHostModule } from './plugin-loader';

/**
 * PluginModule is global — PluginRegistry, PluginHookBus, and PluginService are injectable everywhere.
 *
 * This module:
 *   1. Registers the bundled (plugins.config.ts) and uploaded plugins into PluginRegistry on startup
 *   2. Exposes GET/PATCH/PUT /api/plugins for the admin panel to discover and configure plugins
 *   3. Provides PluginHookBus for sandboxed lifecycle hooks and data filters
 */
@Global()
@Module({
  providers: [
    PluginRegistry,
    PluginHookBus,
    PluginService,
    PluginRouteOwners,
    // Disabled plugins' routes answer 404.
    { provide: APP_GUARD, useClass: PluginEnabledGuard },
  ],
  controllers: [PluginApiController],
  exports: [PluginRegistry, PluginHookBus, PluginService, PluginRouteOwners],
})
export class PluginModule implements OnModuleInit {
  private readonly logger = new Logger(PluginModule.name);

  constructor(
    private readonly registry: PluginRegistry,
    private readonly owners: PluginRouteOwners,
    private readonly modules: ModulesContainer,
  ) {
    // Register here, not in onModuleInit: Nest runs a module class's onModuleInit
    // after its providers', and PluginService.onModuleInit applies the saved
    // on/off state and settings to whatever is registered by then.
    for (const { manifest, module, source, loadError } of loadedPlugins()) {
      try {
        this.registry.register({
          manifest,
          module,
          source,
          loadError,
          // Uploaded plugins start disabled until an admin turns them on (the DB row wins after that).
          enabled: source === 'bundled',
          config: manifest.defaultConfig || {},
        });
      } catch (e) {
        // ignore duplicate registrations
      }
    }
  }

  onModuleInit() {
    this.mapPluginControllers();
  }

  /**
   * Record which controllers each plugin owns, for PluginEnabledGuard: those in
   * the plugin's root module and in modules only that plugin imports (its
   * sub-modules) — not core modules it imports, like PrismaModule.
   */
  private mapPluginControllers() {
    const roots = new Map<Type<any>, string>(
      loadedPlugins().flatMap(({ manifest, module }) => (module ? [[module, manifest.id] as [Type<any>, string]] : [])),
    );
    const all = [...this.modules.values()];
    const imported = new Set<NestModuleRef>();
    for (const m of all) for (const i of m.imports ?? []) imported.add(i);

    // Core = everything reachable from the app root without going through a plugin.
    const core = new Set<NestModuleRef>();
    const stack = all.filter((m) => !imported.has(m));
    while (stack.length) {
      const m = stack.pop()!;
      if (core.has(m) || roots.has(m.metatype as Type<any>)) continue;
      core.add(m);
      if (m.metatype === PluginHostModule) continue;
      for (const i of m.imports ?? []) stack.push(i);
    }

    let count = 0;
    const owned = new Set<NestModuleRef>();
    for (const root of all) {
      const pluginId = roots.get(root.metatype as Type<any>);
      if (!pluginId) continue;
      const queue = [root];
      while (queue.length) {
        const m = queue.pop()!;
        if (owned.has(m) || core.has(m)) continue;
        owned.add(m);
        for (const wrapper of m.controllers.values()) {
          if (typeof wrapper.metatype === 'function') {
            this.owners.set(wrapper.metatype as Type<any>, pluginId);
            count++;
          }
        }
        for (const i of m.imports ?? []) queue.push(i);
      }
    }
    if (count) this.logger.log(`Gating ${count} plugin controller(s) on their plugin's enabled state`);
  }
}
