import { Injectable, Logger, Type } from '@nestjs/common';

export interface PluginConfigField {
  name: string;
  label: string;
  type: 'text' | 'number' | 'boolean' | 'textarea' | 'select' | 'password';
  description?: string;
  defaultValue?: any;
  options?: Array<{ label: string; value: any }>;
  required?: boolean;
}

export interface PluginManifest {
  /** Unique machine-readable identifier. Use kebab-case: 'word-count' */
  id: string;
  name: string;
  version: string;
  description: string;
  author?: string;
  homepage?: string;
  category?: 'content' | 'seo' | 'analytics' | 'security' | 'integrations' | 'utilities';
  icon?: string; // Lucide icon name, e.g. 'FileText', 'Globe', 'Zap', 'Shield'
  /** Scopes the plugin has declared it needs, e.g. ['entries:read', 'entries:write'] */
  permissions: string[];
  /** Optional configurable fields editable in the admin settings drawer */
  configSchema?: PluginConfigField[];
  defaultConfig?: Record<string, any>;
}

export interface RegisteredPlugin {
  manifest: PluginManifest;
  /** The NestJS module class for this plugin */
  module: Type<any>;
  enabled: boolean;
  config: Record<string, any>;
}

/**
 * Central registry that holds all installed plugins.
 * Injected into the plugin API controller, hook bus, and available throughout the app.
 *
 * Plugins are registered at app startup via plugins.config.ts.
 * Runtime enable/disable and configurations are synced with the database.
 */
@Injectable()
export class PluginRegistry {
  private readonly logger = new Logger(PluginRegistry.name);
  private readonly plugins = new Map<string, RegisteredPlugin>();

  register(plugin: RegisteredPlugin): void {
    if (this.plugins.has(plugin.manifest.id)) {
      throw new Error(`Plugin "${plugin.manifest.id}" is already registered`);
    }
    const initialConfig = {
      ...(plugin.manifest.defaultConfig || {}),
      ...(plugin.config || {}),
    };
    this.plugins.set(plugin.manifest.id, {
      ...plugin,
      config: initialConfig,
    });
    this.logger.log(`Plugin registered: ${plugin.manifest.name} v${plugin.manifest.version} [enabled=${plugin.enabled}]`);
  }

  getAll(): RegisteredPlugin[] {
    return Array.from(this.plugins.values());
  }

  get(id: string): RegisteredPlugin | undefined {
    return this.plugins.get(id);
  }

  getEnabled(): RegisteredPlugin[] {
    return this.getAll().filter((p) => p.enabled);
  }

  isEnabled(id: string): boolean {
    if (!id || id === 'core') return true;
    return this.plugins.get(id)?.enabled ?? false;
  }

  enable(id: string): boolean {
    const plugin = this.plugins.get(id);
    if (!plugin) return false;
    plugin.enabled = true;
    this.logger.log(`Plugin "${id}" enabled`);
    return true;
  }

  disable(id: string): boolean {
    const plugin = this.plugins.get(id);
    if (!plugin) return false;
    plugin.enabled = false;
    this.logger.log(`Plugin "${id}" disabled`);
    return true;
  }

  setConfig(id: string, config: Record<string, any>): boolean {
    const plugin = this.plugins.get(id);
    if (!plugin) return false;
    plugin.config = { ...plugin.config, ...config };
    return true;
  }

  getConfig(id: string): Record<string, any> {
    return this.plugins.get(id)?.config || {};
  }

  hasPermission(id: string, permission: string): boolean {
    if (!id || id === 'core') return true;
    const plugin = this.plugins.get(id);
    if (!plugin) return false;
    return plugin.manifest.permissions.includes(permission) || plugin.manifest.permissions.includes('*');
  }

  syncWithDb(dbPlugins: Array<{ id: string; enabled: boolean; config?: any }>): void {
    for (const row of dbPlugins) {
      const plugin = this.plugins.get(row.id);
      if (plugin) {
        plugin.enabled = row.enabled;
        if (row.config && typeof row.config === 'object') {
          plugin.config = {
            ...(plugin.manifest.defaultConfig || {}),
            ...row.config,
          };
        }
      }
    }
  }

  count(): number {
    return this.plugins.size;
  }
}
