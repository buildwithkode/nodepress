import { of, lastValueFrom } from 'rxjs';
import { HttpCacheInterceptor } from './http-cache.interceptor';

function run(method: string, presetCacheControl?: string, ifNoneMatch?: string) {
  const headers: Record<string, string> = {};
  if (presetCacheControl) headers['Cache-Control'] = presetCacheControl;
  const res: any = {
    headersSent: false,
    statusCode: 200,
    getHeader: (k: string) => headers[k],
    setHeader: (k: string, v: string) => { headers[k] = v; },
    status(code: number) { this.statusCode = code; return this; },
    end: jest.fn(),
  };
  const req: any = { method, headers: ifNoneMatch ? { 'if-none-match': ifNoneMatch } : {} };
  const ctx: any = { switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }) };
  const out = lastValueFrom(new HttpCacheInterceptor().intercept(ctx, { handle: () => of({ a: 1 }) }));
  return { out, headers, res };
}

describe('HttpCacheInterceptor', () => {
  it('lets browsers revalidate and a CDN cache published responses', async () => {
    const { out, headers } = run('GET');
    await out;
    expect(headers['Cache-Control']).toMatch(/^public, max-age=0, s-maxage=\d+, stale-while-revalidate=60$/);
    expect(headers.ETag).toBeDefined();
  });

  it('never makes a private response public', async () => {
    const { out, headers } = run('GET', 'private, no-store');
    await out;
    expect(headers['Cache-Control']).toBe('private, no-store');
  });

  it('answers a matching If-None-Match with 304', async () => {
    const first = run('GET');
    await first.out;
    const second = run('GET', undefined, first.headers.ETag);
    expect(await second.out).toBeNull();
    expect(second.res.statusCode).toBe(304);
  });
});
