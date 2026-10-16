import { RedisThrottlerStorage } from './redis-throttler.storage';

describe('RedisThrottlerStorage', () => {
  it('falls back to in-memory limits when REDIS_URL is unset', async () => {
    const storage = new RedisThrottlerStorage(undefined);
    const first = await storage.increment('ip', 60_000, 2, 5_000, 'default');
    const second = await storage.increment('ip', 60_000, 2, 5_000, 'default');
    const third = await storage.increment('ip', 60_000, 2, 5_000, 'default');

    expect(first.totalHits).toBe(1);
    expect(second.totalHits).toBe(2);
    expect(third.isBlocked).toBe(true);
  });

  describe('with Redis', () => {
    function withRedis(evalImpl: jest.Mock) {
      const storage = new RedisThrottlerStorage(undefined);
      (storage as any).redis = { status: 'ready', eval: evalImpl };
      return storage;
    }

    it('maps the script result and converts milliseconds to whole seconds', async () => {
      const evalMock = jest.fn().mockResolvedValue([4, 59_001, 1, 4_200]);
      const record = await withRedis(evalMock).increment('1.2.3.4', 60_000, 3, 5_000, 'default');

      expect(record).toEqual({ totalHits: 4, timeToExpire: 60, isBlocked: true, timeToBlockExpire: 5 });
      expect(evalMock).toHaveBeenCalledWith(
        expect.any(String), 2,
        'throttle:default:1.2.3.4:hits', 'throttle:default:1.2.3.4:block',
        60_000, 3, 5_000,
      );
    });

    it('falls back to in-memory limits when a Redis call fails', async () => {
      const storage = withRedis(jest.fn().mockRejectedValue(new Error('ECONNRESET')));
      const record = await storage.increment('ip', 60_000, 5, 5_000, 'default');
      expect(record.totalHits).toBe(1);
      expect(record.isBlocked).toBe(false);
    });
  });
});
