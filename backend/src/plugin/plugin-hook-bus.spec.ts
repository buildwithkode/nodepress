import { PluginHookBus } from './plugin-hook-bus';
import { PluginEvents } from './plugin.events';

describe('PluginHookBus', () => {
  let bus: PluginHookBus;

  beforeEach(() => {
    bus = new PluginHookBus();
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

    it('does not crash when hook throws error', async () => {
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
