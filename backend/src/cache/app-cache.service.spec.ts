import { Test, TestingModule } from '@nestjs/testing';
import { AppCacheService } from './app-cache.service';

describe('AppCacheService (in-memory mode)', () => {
  let service: AppCacheService;

  beforeEach(async () => {
    // No REDIS_URL set → always uses the in-memory Map
    delete process.env.REDIS_URL;

    const module: TestingModule = await Test.createTestingModule({
      providers: [AppCacheService],
    }).compile();

    service = module.get<AppCacheService>(AppCacheService);
    await service.onModuleInit();
  });

  afterEach(async () => {
    await service.onModuleDestroy();
  });

  it('returns undefined for a missing key', async () => {
    expect(await service.get('missing')).toBeUndefined();
  });

  it('stores and retrieves a value', async () => {
    await service.set('key1', { name: 'test' }, 5_000);
    expect(await service.get('key1')).toEqual({ name: 'test' });
  });

  it('returns undefined after TTL expires', async () => {
    await service.set('key2', 'value', 1); // 1 ms TTL
    await new Promise((r) => setTimeout(r, 10));
    expect(await service.get('key2')).toBeUndefined();
  });

  it('invalidatePrefix removes matching keys only', async () => {
    await service.set('dyn:blog:list', [1, 2, 3], 10_000);
    await service.set('dyn:blog:slug:hello', { id: 1 }, 10_000);
    await service.set('dyn:page:list', [4, 5, 6], 10_000);

    await service.invalidatePrefix('dyn:blog:');

    expect(await service.get('dyn:blog:list')).toBeUndefined();
    expect(await service.get('dyn:blog:slug:hello')).toBeUndefined();
    expect(await service.get('dyn:page:list')).toEqual([4, 5, 6]); // unaffected
  });

  it('increment returns 1 on first call', async () => {
    const count = await service.increment('ratelimit:key1', 60_000);
    expect(count).toBe(1);
  });

  it('increment accumulates within TTL window', async () => {
    await service.increment('ratelimit:key2', 60_000);
    await service.increment('ratelimit:key2', 60_000);
    const count = await service.increment('ratelimit:key2', 60_000);
    expect(count).toBe(3);
  });

  it('increment resets after TTL expires', async () => {
    await service.increment('ratelimit:key3', 1); // 1 ms TTL
    await new Promise((r) => setTimeout(r, 10));
    const count = await service.increment('ratelimit:key3', 60_000);
    expect(count).toBe(1);
  });

  it('isRedisConnected is false when no REDIS_URL', () => {
    expect(service.isRedisConnected).toBe(false);
  });

  it('size reflects number of stored entries', async () => {
    const before = service.size;
    await service.set('sz:1', 'a', 10_000);
    await service.set('sz:2', 'b', 10_000);
    expect(service.size).toBe(before + 2);
  });
});
