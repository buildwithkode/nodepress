import { createServer, Server } from 'http';
import { AddressInfo } from 'net';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { DownloadError, assertDownloadableUrl, guardedLookup, isPrivateAddress, safeDownload } from './safe-download';

describe('isPrivateAddress', () => {
  it.each([
    '127.0.0.1', '127.1.2.3', '10.0.0.5', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254',
    '100.64.0.1', '0.0.0.0', '224.0.0.1', '255.255.255.255', '::1', '::', 'fe80::1', 'fc00::1', 'fd12:3456::1',
    '::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:10.0.0.1', '::127.0.0.1', 'not-an-ip',
  ])('%s is refused', (ip) => expect(isPrivateAddress(ip)).toBe(true));

  it.each(['8.8.8.8', '1.1.1.1', '172.32.0.1', '192.169.0.1', '2606:4700:4700::1111', '::ffff:8.8.8.8'])(
    '%s is public', (ip) => expect(isPrivateAddress(ip)).toBe(false),
  );
});

describe('assertDownloadableUrl', () => {
  it('accepts public http(s) URLs', () => {
    expect(assertDownloadableUrl('https://example.com/a.png').hostname).toBe('example.com');
  });

  it.each([
    ['file:///etc/passwd', /http and https/],
    ['ftp://example.com/a', /http and https/],
    ['http://127.0.0.1/a', /private/],
    ['http://[::1]/a', /private/],
    ['http://169.254.169.254/latest/meta-data', /private/],
    ['http://localhost:3000/a', /localhost/],
    ['http://user:pw@example.com/a', /credentials/],
    ['not a url', /Invalid URL/],
  ])('refuses %s', (url, message) => {
    expect(() => assertDownloadableUrl(url)).toThrow(message);
  });

  it('lets tests allow private hosts', () => {
    expect(() => assertDownloadableUrl('http://127.0.0.1/a', true)).not.toThrow();
  });
});

describe('guardedLookup', () => {
  const lookup = (host: string, allowPrivate = false, all = false) =>
    new Promise<any>((resolve) => guardedLookup(allowPrivate)(host, { all }, (err: any, address: any) => resolve(err ?? address)));

  it('refuses names that resolve to private addresses', async () => {
    const res = await lookup('localhost');
    expect(res).toBeInstanceOf(DownloadError);
    expect(res.message).toMatch(/private address/);
  });

  it('passes the address through when allowed', async () => {
    expect(await lookup('localhost', true)).toMatch(/^(127\.0\.0\.1|::1)$/);
    const all = await lookup('localhost', true, true);
    expect(Array.isArray(all)).toBe(true);
  });
});

describe('safeDownload (local server, private hosts allowed)', () => {
  let server: Server;
  let base: string;
  let dir: string;

  beforeAll(async () => {
    server = createServer((req, res) => {
      if (req.url === '/ok') { res.setHeader('Content-Type', 'image/png'); res.end('hello'); return; }
      if (req.url === '/big') { res.end(Buffer.alloc(2048)); return; }
      if (req.url === '/redirect') { res.statusCode = 302; res.setHeader('Location', '/ok'); res.end(); return; }
      if (req.url === '/loop') { res.statusCode = 302; res.setHeader('Location', '/loop'); res.end(); return; }
      if (req.url === '/evil-redirect') { res.statusCode = 302; res.setHeader('Location', 'file:///etc/passwd'); res.end(); return; }
      if (req.url === '/slow') { setTimeout(() => res.end('late'), 2000).unref(); return; }
      res.statusCode = 404; res.end();
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    dir = mkdtempSync(join(tmpdir(), 'np-dl-'));
  });

  afterAll(async () => {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
    rmSync(dir, { recursive: true, force: true });
  });

  const opts = { maxBytes: 1024, timeoutMs: 1000, allowPrivate: true };

  it('downloads a file and follows redirects', async () => {
    const dest = join(dir, 'a');
    const res = await safeDownload(`${base}/redirect`, dest, opts);
    expect(res).toMatchObject({ bytes: 5, contentType: 'image/png' });
    expect(readFileSync(dest, 'utf8')).toBe('hello');
  });

  it('refuses the local server without allowPrivate', async () => {
    await expect(safeDownload(`${base}/ok`, join(dir, 'b'), { ...opts, allowPrivate: false })).rejects.toThrow(/private/);
  });

  it.each([
    ['/big', /larger than/],
    ['/missing', /HTTP 404/],
    ['/loop', /Too many redirects/],
    ['/evil-redirect', /http and https/],
    ['/slow', /Timed out/],
  ])('fails on %s and leaves no file behind', async (path, message) => {
    const dest = join(dir, `f${path.replace('/', '-')}`);
    await expect(safeDownload(`${base}${path}`, dest, opts)).rejects.toThrow(message);
    expect(existsSync(dest)).toBe(false);
  });
});
