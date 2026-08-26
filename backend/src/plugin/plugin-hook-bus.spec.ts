import { PluginHookBus } from './plugin-hook-bus';
import { PluginRegistry } from './plugin.registry';
import { PluginEvents } from './plugin.events';

describe('PluginHookBus', () => {
  let bus: PluginHookBus;
  let registry: PluginRegistry;

  beforeEach(() => {
    registry = new PluginRegistry();
    bus = new PluginHookBus(registry);
  });

  describe('emit()', () => {
    it('executes hooks in priority order (lower priority number first)', async () => {
      const order: number[] = [];

      bus.on(PluginEvents.ENTRY_AFTER_CREATE, async () => {
        order.push(2);
      }, 20);

      bus.on(PluginEvents.ENTRY_AFTER_CREATE, async () => {
        order.push(1);
      }, 5);

      await bus.emit(PluginEvents.ENTRY_AFTER_CREATE, { id: 1, slug: 'test' });
      expect(order).toEqual([1, 2]);
    });

    it('does not crash when hook throws error (Layer 2 Crash Isolation)', async () => {
      bus.on(PluginEvents.ENTRY_AFTER_CREATE, () => {
        throw new Error('Plugin failure');
      });

      let nextRan = false;
      bus.on(PluginEvents.ENTRY_AFTER_CREATE, () => {
        nextRan = true;
      }, 20);

      await expect(bus.emit(PluginEvents.ENTRY_AFTER_CREATE, { id: 1 })).resolves.not.toThrow();
      expect(nextRan).toBe(true);
    });

    it('skips hook execution if plugin is disabled in registry', async () => {
      registry.register({
        manifest: {
          id: 'test-plugin',
          name: 'Test Plugin',
          version: '1.0.0',
          description: 'Testing',
          permissions: ['entries:read'],
        },
        module: class MockModule {},
        enabled: false, // DISABLED
        config: {},
      });

      let executed = false;
      bus.on(PluginEvents.ENTRY_AFTER_CREATE, () => {
        executed = true;
      }, 10, 'test-plugin');

      await bus.emit(PluginEvents.ENTRY_AFTER_CREATE, { id: 1 });
      expect(executed).toBe(false);

      // Now enable it live
      registry.enable('test-plugin');
      await bus.emit(PluginEvents.ENTRY_AFTER_CREATE, { id: 1 });
      expect(executed).toBe(true);
    });

    it('blocks execution if plugin lacks required capability permission (Layer 1 Security)', async () => {
      registry.register({
        manifest: {
          id: 'limited-plugin',
          name: 'Limited Plugin',
          version: '1.0.0',
          description: 'Testing permissions',
          permissions: ['entries:read'], // ONLY read permission
        },
        module: class MockModule {},
        enabled: true,
        config: {},
      });

      let executed = false;
      bus.on(
        PluginEvents.ENTRY_BEFORE_DELETE,
        () => {
          executed = true;
        },
        10,
        'limited-plugin',
        'entries:delete', // Requires delete permission
      );

      await bus.emit(PluginEvents.ENTRY_BEFORE_DELETE, { id: 1 });
      expect(executed).toBe(false);
    });
  });

  describe('applyFilters()', () => {
    it('pipes data through sequential transformers', async () => {
      bus.addFilter('entry.title', (title: string) => title.trim());
      bus.addFilter('entry.title', (title: string) => title.toUpperCase());

      const result = await bus.applyFilters('entry.title', '  hello world  ');
      expect(result).toBe('HELLO WORLD');
    });

    it('returns initial value if no filters registered', async () => {
      const result = await bus.applyFilters('entry.unregistered', { foo: 'bar' });
      expect(result).toEqual({ foo: 'bar' });
    });
  });
});
