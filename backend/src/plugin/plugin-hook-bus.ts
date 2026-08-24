import { Injectable, Logger } from '@nestjs/common';

export type HookHandler<T = any> = (payload: T, context?: any) => Promise<void> | void;
export type FilterHandler<T = any> = (value: T, context?: any) => Promise<T> | T;

export interface RegisteredHook {
  handler: HookHandler;
  priority: number;
  pluginId?: string;
}

export interface RegisteredFilter {
  handler: FilterHandler;
  priority: number;
  pluginId?: string;
}

/**
 * High-performance lifecycle hook and filter bus for NodePress plugins.
 * Supports priority-ordered asynchronous action execution and data pipeline filters.
 */
@Injectable()
export class PluginHookBus {
  private readonly logger = new Logger(PluginHookBus.name);
  private readonly hooks = new Map<string, RegisteredHook[]>();
  private readonly filters = new Map<string, RegisteredFilter[]>();

  /**
   * Register a lifecycle action hook.
   * @param event - Event name (e.g. PluginEvents.ENTRY_AFTER_CREATE)
   * @param handler - Async or sync hook callback
   * @param priority - Execution order (default: 10; lower runs earlier)
   * @param pluginId - Optional plugin identifier
   */
  on<T = any>(event: string, handler: HookHandler<T>, priority = 10, pluginId?: string): void {
    const list = this.hooks.get(event) ?? [];
    list.push({ handler, priority, pluginId });
    list.sort((a, b) => a.priority - b.priority);
    this.hooks.set(event, list);
  }

  /**
   * Register a data transformation filter.
   * @param filterName - Filter name (e.g. 'entry.sanitize_data')
   * @param handler - Transformer function returning modified data
   * @param priority - Execution order (default: 10)
   * @param pluginId - Optional plugin identifier
   */
  addFilter<T = any>(
    filterName: string,
    handler: FilterHandler<T>,
    priority = 10,
    pluginId?: string,
  ): void {
    const list = this.filters.get(filterName) ?? [];
    list.push({ handler, priority, pluginId });
    list.sort((a, b) => a.priority - b.priority);
    this.filters.set(filterName, list);
  }

  /**
   * Emit an event to all registered action listeners in priority order.
   */
  async emit<T = any>(event: string, payload: T, context?: any): Promise<void> {
    const list = this.hooks.get(event);
    if (!list || list.length === 0) return;

    for (const { handler, pluginId } of list) {
      try {
        await handler(payload, context);
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
    for (const { handler, pluginId } of list) {
      try {
        current = await handler(current, context);
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
