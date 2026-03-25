import { Global, Module, OnModuleInit } from '@nestjs/common';
import { PluginRegistry } from './plugin.registry';
import { PluginApiController } from './plugin-api.controller';
import { ENABLED_PLUGINS } from './plugins.config';

/**
 * PluginModule is global — PluginRegistry is injectable everywhere.
 *
 * This module:
 *   1. Registers all plugins from plugins.config.ts into PluginRegistry on startup
 *   2. Exposes GET /api/plugins for the admin panel to discover installed plugins
 *
 * Plugin NestJS modules are imported dynamically (see app.module.ts) so their
 * controllers, services, and event listeners are all wired into the DI container.
 */
@Global()
@Module({
  providers: [PluginRegistry],
  controllers: [PluginApiController],
  exports: [PluginRegistry],
})
export class PluginModule implements OnModuleInit {
  constructor(private readonly registry: PluginRegistry) {}

  onModuleInit() {
    for (const { manifest, module } of ENABLED_PLUGINS) {
      this.registry.register({ manifest, module, enabled: true });
    }
  }
}
