import { createServer, Server } from 'http';
import { AddressInfo } from 'net';
import { OutboundRefusedError, assertOutboundUrl, outboundPost } from './outbound-post';

describe('assertOutboundUrl', () => {
  it('accepts public http(s) URLs, with credentials', () => {
    expect(assertOutboundUrl('https://example.com/hook', false).hostname).toBe('example.com');
    expect(assertOutboundUrl('https://user:pass@example.com/hook', false).username).toBe('user');
  });

  it.each([
    ['file:///etc/passwd', /http and https/],
    ['http://127.0.0.1/hook', /private/],
    ['http://[::1]/hook', /private/],
    ['http://169.254.169.254/latest/meta-data', /private/],
    ['http://10.0.0.5:5678/webhook', /private/],
    ['http://localhost:5678/webhook', /localhost/],
    ['http://n8n.localhost/webhook', /localhost/],
    ['not a url', /Invalid URL/],
  ])('refuses %s', (url, message) => {
    expect(() => assertOutboundUrl(url, false)).toThrow(message);
  });

  it('allows private addresses when allowPrivate is set', () => {
    expect(assertOutboundUrl('http://localhost:5678/webhook', true).port).toBe('5678');
    expect(() => assertOutboundUrl('file:///etc/passwd', true)).toThrow(/http and https/);
  });
});

describe('outboundPost', () => {
  let server: Server;
  let base: string;
  let received: { method?: string; body: string; headers: Record<string, any> }[];

  beforeAll(async () => {
    server = createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        received.push({ method: req.method, body, headers: req.headers });
        if (req.url === '/redirect') {
          res.writeHead(302, { Location: 'http://169.254.169.254/' }).end();
        } else if (req.url === '/slow') {
          setTimeout(() => res.writeHead(200).end(), 500);
        } else {
          res.writeHead(req.url === '/fail' ? 503 : 200).end('ok');
        }
      });
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise((r) => server.close(r)));
  beforeEach(() => { received = []; });

  it('refuses a loopback receiver by default', async () => {
    await expect(outboundPost(`${base}/hook`, { body: '{}', timeoutMs: 2000, allowPrivate: false }))
      .rejects.toBeInstanceOf(OutboundRefusedError);
    expect(received).toHaveLength(0);
  });

  it('refuses a hostname that resolves to a private address', async () => {
    const port = (server.address() as AddressInfo).port;
    // `localhost.` (trailing dot) gets past the name check, so the DNS-time check must catch it.
    await expect(outboundPost(`http://localhost.:${port}/hook`, { body: '{}', timeoutMs: 2000, allowPrivate: false }))
      .rejects.toBeInstanceOf(OutboundRefusedError);
    expect(received).toHaveLength(0);
  });

  it('sends the method, headers and body when allowed', async () => {
    const res = await outboundPost(`${base}/hook`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Test': '1' }, body: '{"a":1}',
      timeoutMs: 2000, allowPrivate: true,
    });
    expect(res).toEqual({ status: 200, ok: true });
    expect(received[0]).toMatchObject({ method: 'PUT', body: '{"a":1}', headers: expect.objectContaining({ 'x-test': '1' }) });
  });

  it('returns a non-2xx status without throwing', async () => {
    expect(await outboundPost(`${base}/fail`, { timeoutMs: 2000, allowPrivate: true })).toEqual({ status: 503, ok: false });
  });

  it('does not follow redirects', async () => {
    expect(await outboundPost(`${base}/redirect`, { timeoutMs: 2000, allowPrivate: true })).toEqual({ status: 302, ok: false });
    expect(received).toHaveLength(1);
  });

  it('times out', async () => {
    await expect(outboundPost(`${base}/slow`, { timeoutMs: 100, allowPrivate: true })).rejects.toThrow(/Timed out/);
  });
});
