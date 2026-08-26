import { Injectable, Logger, Optional } from '@nestjs/common';
import { PluginRegistry } from './plugin.registry';

export type HookHandler<T = any> = (payload: T, context?: any) => Promise<void> | void;
export type FilterHandler<T = any> = (value: T, context?: any) => Promise<T> | T;

export interface RegisteredHook {
  handler: HookHandler;
  priority: number;
  pluginId?: string;
  requiredPermission?: string;
}

export interface RegisteredFilter {
  handler: FilterHandler;
  priority: number;
  pluginId?: string;
  requiredPermission?: string;
}

/**
 * High-performance, sandboxed lifecycle hook and filter bus for NodePress plugins.
 * Features:
 *  - Capability-based permission enforcement (Layer 1)
 *  - Crash isolation error boundaries (Layer 2)
 *  - 5-second hard execution timeout per hook (Layer 4)
 *  - Dynamic live enabled/disabled check on every dispatch
 */
@Injectable()
export class PluginHookBus {
  private readonly logger = new Logger(PluginHookBus.name);
  private readonly hooks = new Map<string, RegisteredHook[]>();
  private readonly filters = new Map<string, RegisteredFilter[]>();
  private registry: PluginRegistry;

  constructor(@Optional() registry?: PluginRegistry) {
    this.registry = registry || new PluginRegistry();
  }

  setRegistry(registry: PluginRegistry): void {
    this.registry = registry;
  }

  /**
   * Register a lifecycle action hook.
   * @param event - Event name (e.g. PluginEvents.ENTRY_AFTER_CREATE)
   * @param handler - Async or sync hook callback
   * @param priority - Execution order (default: 10; lower runs earlier)
   * @param pluginId - Optional plugin identifier
   * @param requiredPermission - Optional capability permission required (e.g. 'entries:write')
   */
  on<T = any>(
    event: string,
    handler: HookHandler<T>,
    priority = 10,
    pluginId?: string,
    requiredPermission?: string,
  ): void {
    const list = this.hooks.get(event) ?? [];
    list.push({ handler, priority, pluginId, requiredPermission });
    list.sort((a, b) => a.priority - b.priority);
    this.hooks.set(event, list);
  }

  /**
   * Register a data transformation filter.
   * @param filterName - Filter name (e.g. 'entry.sanitize_data')
   * @param handler - Transformer function returning modified data
   * @param priority - Execution order (default: 10)
   * @param pluginId - Optional plugin identifier
   * @param requiredPermission - Optional capability permission required
   */
  addFilter<T = any>(
    filterName: string,
    handler: FilterHandler<T>,
    priority = 10,
    pluginId?: string,
    requiredPermission?: string,
  ): void {
    const list = this.filters.get(filterName) ?? [];
    list.push({ handler, priority, pluginId, requiredPermission });
    list.sort((a, b) => a.priority - b.priority);
    this.filters.set(filterName, list);
  }

  /**
   * Safe execution wrapper with hard timeout (Layer 4 defense).
   */
  private async executeWithTimeout<T>(
    fn: () => Promise<T> | T,
    timeoutMs = 5000,
    contextLabel = 'Hook',
  ): Promise<T> {
    let timer: NodeJS.Timeout;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`${contextLabel} execution timed out after ${timeoutMs}ms`)),
        timeoutMs,
      );
    });
    try {
      return await Promise.race([Promise.resolve(fn()), timeoutPromise]);
    } finally {
      clearTimeout(timer!);
    }
  }

  /**
   * Emit an event to all registered action listeners in priority order.
   * Enforces enabled state, permission checks, crash isolation, and 5s timeout.
   */
  async emit<T = any>(event: string, payload: T, context?: any): Promise<void> {
    const list = this.hooks.get(event);
    if (!list || list.length === 0) return;

    for (const { handler, pluginId, requiredPermission } of list) {
      // 1. Check if plugin is enabled
      if (pluginId && !this.registry.isEnabled(pluginId)) {
        continue;
      }

      // 2. Capability Permission check (Layer 1)
      if (pluginId && requiredPermission && !this.registry.hasPermission(pluginId, requiredPermission)) {
        this.logger.warn(
          `Security block: Plugin "${pluginId}" lacks required permission "${requiredPermission}" for hook "${event}". Skipping.`,
        );
        continue;
      }

      // 3. Isolated execution with timeout (Layer 2 & 4)
      try {
        await this.executeWithTimeout(
          () => handler(payload, context),
          5000,
          `Hook "${event}" in plugin "${pluginId || 'core'}"`,
        );
      } catch (err: any) {
        this.logger.error(
          `Error executing hook "${event}" for plugin "${pluginId || 'core'}": ${err?.message || err}`,
          err?.stack,
        );
      }
    }
  }

  /**
   * Pass a value through a waterfall pipeline of filter transformers.
   */
  async applyFilters<T = any>(filterName: string, initialValue: T, context?: any): Promise<T> {
    const list = this.filters.get(filterName);
    if (!list || list.length === 0) return initialValue;

    let current = initialValue;
    for (const { handler, pluginId, requiredPermission } of list) {
      // 1. Check if plugin is enabled
      if (pluginId && !this.registry.isEnabled(pluginId)) {
        continue;
      }

      // 2. Capability Permission check (Layer 1)
      if (pluginId && requiredPermission && !this.registry.hasPermission(pluginId, requiredPermission)) {
        this.logger.warn(
          `Security block: Plugin "${pluginId}" lacks required permission "${requiredPermission}" for filter "${filterName}". Skipping.`,
        );
        continue;
      }

      // 3. Isolated execution with timeout
      try {
        current = await this.executeWithTimeout(
          () => handler(current, context),
          5000,
          `Filter "${filterName}" in plugin "${pluginId || 'core'}"`,
        );
      } catch (err: any) {
        this.logger.error(
          `Error executing filter "${filterName}" for plugin "${pluginId || 'core'}": ${err?.message || err}`,
          err?.stack,
        );
      }
    }
    return current;
  }

  /**
   * Get total number of registered hooks and filters.
   */
  getSummary(): { totalHooks: number; totalFilters: number; events: string[] } {
    const events = Array.from(new Set([...this.hooks.keys(), ...this.filters.keys()]));
    let totalHooks = 0;
    for (const list of this.hooks.values()) totalHooks += list.length;
    let totalFilters = 0;
    for (const list of this.filters.values()) totalFilters += list.length;

    return { totalHooks, totalFilters, events };
  }

  /**
   * Clear all registered hooks (useful for testing).
   */
  clear(): void {
    this.hooks.clear();
    this.filters.clear();
  }
}
