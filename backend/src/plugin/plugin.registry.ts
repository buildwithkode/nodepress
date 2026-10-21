import { Injectable, Logger, Type } from '@nestjs/common';
import * as semver from 'semver';
import { isKnownPermission } from './plugin-permissions';

/** The running NodePress version (all manifests carry the same version). */
export const NODEPRESS_VERSION: string = require('../../package.json').version;

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
  /**
   * NodePress versions this plugin works with, as a semver range (e.g. "^1.6.0").
   * An incompatible plugin is loaded disabled, with the reason on the Plugins page.
   */
  nodepress?: string;
}

export interface RegisteredPlugin {
  manifest: PluginManifest;
  /** The NestJS module class for this plugin */
  module: Type<any>;
  enabled: boolean;
  config: Record<string, any>;
  /** Why the plugin can't run on this NodePress (it stays disabled), if any. */
  incompatible?: string;
}

/** Reason a manifest can't run on this NodePress version, or null when it can. */
export function compatibilityProblem(manifest: PluginManifest, coreVersion = NODEPRESS_VERSION): string | null {
  if (!manifest.nodepress) return null;
  if (!semver.validRange(manifest.nodepress)) return `Invalid "nodepress" range "${manifest.nodepress}" in manifest`;
  if (!semver.satisfies(coreVersion, manifest.nodepress, { includePrerelease: true })) {
    return `Requires NodePress ${manifest.nodepress}; this install runs ${coreVersion}`;
  }
  return null;
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
  private readonly configListeners = new Map<string, Array<(config: Record<string, any>) => void>>();

  register(plugin: RegisteredPlugin): void {
    if (this.plugins.has(plugin.manifest.id)) {
      throw new Error(`Plugin "${plugin.manifest.id}" is already registered`);
    }
    const unknown = (plugin.manifest.permissions || []).filter((p) => !isKnownPermission(p));
    if (unknown.length) {
      this.logger.warn(`Plugin "${plugin.manifest.id}" declares unknown permission(s): ${unknown.join(', ')}`);
    }
    const incompatible = compatibilityProblem(plugin.manifest) ?? undefined;
    if (incompatible) this.logger.warn(`Plugin "${plugin.manifest.id}" disabled: ${incompatible}`);
    const initialConfig = {
      ...(plugin.manifest.defaultConfig || {}),
      ...(plugin.config || {}),
    };
    this.plugins.set(plugin.manifest.id, {
      ...plugin,
      enabled: incompatible ? false : plugin.enabled,
      incompatible,
      config: initialConfig,
    });
    this.logger.log(`Plugin registered: ${plugin.manifest.name} v${plugin.manifest.version} [enabled=${incompatible ? false : plugin.enabled}]`);
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
    if (!plugin || plugin.incompatible) return false;
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
    this.notifyConfig(id);
    return true;
  }

  /** Called (with the new config) whenever an admin changes this plugin's settings. */
  onConfigChange(id: string, listener: (config: Record<string, any>) => void): void {
    const list = this.configListeners.get(id) ?? [];
    list.push(listener);
    this.configListeners.set(id, list);
  }

  private notifyConfig(id: string) {
    const config = this.getConfig(id);
    for (const listener of this.configListeners.get(id) ?? []) {
      try { listener(config); } catch (err: any) { this.logger.error(`Config listener of "${id}" failed: ${err?.message}`); }
    }
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
        plugin.enabled = plugin.incompatible ? false : row.enabled;
        // Config may arrive as a JSON string depending on how the row was written.
        let configObj = row.config;
        if (typeof configObj === 'string') {
          try {
            configObj = JSON.parse(configObj);
          } catch {
            // Unparseable config — keep the manifest defaults below.
          }
        }
        if (configObj && typeof configObj === 'object') {
          plugin.config = {
            ...(plugin.manifest.defaultConfig || {}),
            ...configObj,
          };
        }
      }
    }
  }

  count(): number {
    return this.plugins.size;
  }
}
