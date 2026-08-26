import { Global, Module, OnModuleInit } from '@nestjs/common';
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
  providers: [PluginRegistry, PluginHookBus, PluginService],
  controllers: [PluginApiController],
  exports: [PluginRegistry, PluginHookBus, PluginService],
})
export class PluginModule implements OnModuleInit {
  constructor(private readonly registry: PluginRegistry) {}

  onModuleInit() {
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
}
