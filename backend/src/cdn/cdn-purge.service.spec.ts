import { createHmac } from 'crypto';
import { env } from '../config/env';
import { CdnPurgeService, CDN_PURGE_JOB, cdnCacheTtl, publicCacheTags } from './cdn-purge.service';

const saved = { ...env };
const setEnv = (patch: Partial<typeof env>) => Object.assign(env, patch);

describe('CdnPurgeService', () => {
  let jobs: any;
  let cdn: CdnPurgeService;
  let originalFetch: typeof fetch;

  beforeEach(() => {
    jest.useFakeTimers();
    jobs = { registerHandler: jest.fn(), enqueue: jest.fn().mockResolvedValue(1) };
    cdn = new CdnPurgeService(jobs);
    originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, text: async () => '' } as any);
  });

  afterEach(() => {
    jest.useRealTimers();
    global.fetch = originalFetch;
    Object.assign(env, saved);
  });

  it('does nothing without a purge driver', async () => {
    setEnv({ CDN_PURGE_DRIVER: 'none' });
    cdn.schedule([1]);
    await jest.runAllTimersAsync();
    expect(jobs.enqueue).not.toHaveBeenCalled();
  });

  it('batches a burst of writes into one purge job', async () => {
    setEnv({ CDN_PURGE_DRIVER: 'webhook', CDN_PURGE_WEBHOOK_URL: 'https://hooks.example.com/purge' });
    cdn.schedule([1]);
    cdn.schedule([2, 1]);
    cdn.schedule([3]);
    await jest.advanceTimersByTimeAsync(2_000);
    expect(jobs.enqueue).toHaveBeenCalledTimes(1);
    expect(jobs.enqueue).toHaveBeenCalledWith(CDN_PURGE_JOB, { tags: ['np-ct-1', 'np-ct-2', 'np-ct-3'] }, { maxAttempts: 5 });
  });

  it('collapses to np-all when everything changed', async () => {
    setEnv({ CDN_PURGE_DRIVER: 'webhook', CDN_PURGE_WEBHOOK_URL: 'https://hooks.example.com/purge' });
    cdn.schedule([1]);
    cdn.schedule('all');
    await cdn.flush();
    expect(jobs.enqueue).toHaveBeenCalledWith(CDN_PURGE_JOB, { tags: ['np-all'] }, expect.anything());
  });

  it('cloudflare: purges by tag, 30 per request, never purge_everything', async () => {
    setEnv({ CDN_PURGE_DRIVER: 'cloudflare', CLOUDFLARE_ZONE_ID: 'zone1', CLOUDFLARE_API_TOKEN: 'tok' });
    const tags = Array.from({ length: 31 }, (_, i) => `np-ct-${i}`);
    await cdn.purge(tags);
    const calls = (global.fetch as jest.Mock).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0][0]).toBe('https://api.cloudflare.com/client/v4/zones/zone1/purge_cache');
    expect(calls[0][1].headers.Authorization).toBe('Bearer tok');
    expect(JSON.parse(calls[0][1].body).tags).toHaveLength(30);
    expect(JSON.parse(calls[1][1].body)).toEqual({ tags: ['np-ct-30'] });
    expect(calls.some(([, init]) => String(init.body).includes('purge_everything'))).toBe(false);
  });

  it('fastly: purges by surrogate key', async () => {
    setEnv({ CDN_PURGE_DRIVER: 'fastly', FASTLY_SERVICE_ID: 'svc', FASTLY_API_TOKEN: 'ftok' });
    await cdn.purge(['np-ct-1', 'np-ct-2']);
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('https://api.fastly.com/service/svc/purge');
    expect(init.headers).toMatchObject({ 'Fastly-Key': 'ftok', 'Surrogate-Key': 'np-ct-1 np-ct-2' });
  });

  it('webhook: posts the tags, signed when a secret is set', async () => {
    setEnv({ CDN_PURGE_DRIVER: 'webhook', CDN_PURGE_WEBHOOK_URL: 'https://hooks.example.com/purge', CDN_PURGE_WEBHOOK_SECRET: 's3cret' });
    await cdn.purge(['np-ct-7']);
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('https://hooks.example.com/purge');
    expect(JSON.parse(init.body)).toMatchObject({ event: 'cdn.purge', tags: ['np-ct-7'] });
    expect(init.headers['X-NodePress-Signature']).toBe(`sha256=${createHmac('sha256', 's3cret').update(init.body).digest('hex')}`);
  });

  it('throws on a CDN error so the job is retried', async () => {
    setEnv({ CDN_PURGE_DRIVER: 'fastly', FASTLY_SERVICE_ID: 'svc', FASTLY_API_TOKEN: 'ftok' });
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false, status: 503, text: async () => 'busy' });
    await expect(cdn.purge(['np-ct-1'])).rejects.toThrow('HTTP 503');
  });

  it('cache TTL: long with a purge driver, short without, overridable', () => {
    setEnv({ CDN_PURGE_DRIVER: 'none', CDN_CACHE_TTL: undefined });
    expect(cdnCacheTtl()).toBe(30);
    setEnv({ CDN_PURGE_DRIVER: 'cloudflare' });
    expect(cdnCacheTtl()).toBe(3600);
    setEnv({ CDN_CACHE_TTL: 120 });
    expect(cdnCacheTtl()).toBe(120);
    expect(publicCacheTags(5)).toEqual(['np-all', 'np-ct-5']);
  });
});
