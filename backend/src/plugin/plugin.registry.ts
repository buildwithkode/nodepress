import { Injectable, Logger, Type } from '@nestjs/common';

export interface PluginManifest {
  /** Unique machine-readable identifier. Use kebab-case: 'my-seo-plugin' */
  id: string;
  name: string;
  version: string;
  description: string;
  /** Scopes the plugin has declared it needs, e.g. ['entries:read', 'media:read'] */
  permissions: string[];
}

export interface RegisteredPlugin {
  manifest: PluginManifest;
  /** The NestJS module class for this plugin */
  module: Type<any>;
  enabled: boolean;
}

/**
 * Central registry that holds all installed plugins.
 * Injected into the plugin API controller and available throughout the app.
 *
 * Plugins are registered at app startup via plugins.config.ts — not at runtime.
 * Runtime enable/disable is tracked here but doesn't hot-reload the NestJS module.
 */
@Injectable()
export class PluginRegistry {
  private readonly logger = new Logger(PluginRegistry.name);
  private readonly plugins = new Map<string, RegisteredPlugin>();

  register(plugin: RegisteredPlugin): void {
    if (this.plugins.has(plugin.manifest.id)) {
      throw new Error(`Plugin "${plugin.manifest.id}" is already registered`);
    }
    this.plugins.set(plugin.manifest.id, plugin);
    this.logger.log(`Plugin registered: ${plugin.manifest.name} v${plugin.manifest.version}`);
  }

  getAll(): RegisteredPlugin[] {
    return Array.from(this.plugins.values());
  }

  getEnabled(): RegisteredPlugin[] {
    return this.getAll().filter((p) => p.enabled);
  }

  isEnabled(id: string): boolean {
    return this.plugins.get(id)?.enabled ?? false;
  }

  count(): number {
    return this.plugins.size;
  }
}
