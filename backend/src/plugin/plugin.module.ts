import { Global, Logger, Module, OnModuleInit, Type } from '@nestjs/common';
import { APP_GUARD, ModulesContainer } from '@nestjs/core';
import { PluginEnabledGuard, PluginRouteOwners } from './plugin-enabled.guard';
import { PluginRegistry } from './plugin.registry';
import { PluginHookBus } from './plugin-hook-bus';
import { PluginService } from './plugin.service';
import { PluginApiController } from './plugin-api.controller';
import { ENABLED_PLUGINS } from './plugins.config';

/**
 * PluginModule is global — PluginRegistry, PluginHookBus, and PluginService are injectable everywhere.
 *
 * This module:
 *   1. Registers all plugins from plugins.config.ts into PluginRegistry on startup
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
  ) {}

  onModuleInit() {
    this.mapPluginControllers();
    for (const { manifest, module } of ENABLED_PLUGINS) {
      try {
        this.registry.register({
          manifest,
          module,
          enabled: true,
          config: manifest.defaultConfig || {},
        });
      } catch (e) {
        // ignore duplicate registrations
      }
    }
  }

  /** Record which controllers each plugin module declares, for PluginEnabledGuard. */
  private mapPluginControllers() {
    const byModule = new Map<Type<any>, string>(ENABLED_PLUGINS.map(({ manifest, module }) => [module, manifest.id]));
    let count = 0;
    for (const moduleRef of this.modules.values()) {
      const pluginId = byModule.get(moduleRef.metatype as Type<any>);
      if (!pluginId) continue;
      for (const wrapper of moduleRef.controllers.values()) {
        if (typeof wrapper.metatype === 'function') {
          this.owners.set(wrapper.metatype as Type<any>, pluginId);
          count++;
        }
      }
    }
    if (count) this.logger.log(`Gating ${count} plugin controller(s) on their plugin's enabled state`);
  }
}
