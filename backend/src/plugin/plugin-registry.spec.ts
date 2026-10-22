import * as fs from 'fs';
import * as http from 'http';
import { AddressInfo } from 'net';
import * as path from 'path';
import { guardedGet, isBlockedAddress, parseRegistry, registryCompatibility } from './plugin-registry';

const valid = (over: Record<string, any> = {}) => ({
  id: 'hello-world',
  name: 'Hello',
  nodepress: '^1.6.0',
  latest: { version: '1.0.0', downloadUrl: 'https://example.com/hello.zip', sha256: 'A'.repeat(64) },
  ...over,
});

describe('parseRegistry', () => {
  it('accepts the registry file shipped in the repo', () => {
    const doc = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../plugins-registry.json'), 'utf8'));
    const { plugins, skipped } = parseRegistry(doc);
    expect(skipped).toEqual([]);
    expect(plugins.map((p) => p.id)).toEqual(['word-count', 'seo-analyzer', 'ecommerce-pro']);
    expect(plugins.filter((p) => p.bundled).map((p) => p.id)).toEqual(['word-count', 'seo-analyzer']);
    const paid = plugins.find((p) => p.pricing === 'paid')!;
    expect(paid.latest?.downloadUrl).toBeUndefined();
    expect(paid.homepage).toMatch(/^https:\/\//);
  });

  it('applies defaults and lowercases the sha256', () => {
    const { plugins } = parseRegistry({ version: 1, plugins: [valid()] });
    expect(plugins[0]).toMatchObject({ description: '', tags: [], pricing: 'free' });
    expect(plugins[0].latest!.sha256).toBe('a'.repeat(64));
  });

  it('rejects a document with the wrong shape', () => {
    expect(() => parseRegistry(null)).toThrow(/not a JSON object/);
    expect(() => parseRegistry([])).toThrow(/not a JSON object/);
    expect(() => parseRegistry({ version: 2, plugins: [] })).toThrow(/version 2/);
    expect(() => parseRegistry({ version: 1 })).toThrow(/"plugins" array/);
  });

  it('skips bad entries and duplicates instead of failing the whole directory', () => {
    const { plugins, skipped } = parseRegistry({
      version: 1,
      plugins: [
        valid(),
        valid(),                                                       // duplicate id
        valid({ id: 'Bad Id' }),
        valid({ id: 'no-range', nodepress: 'whenever' }),
        valid({ id: 'js-link', homepage: 'javascript:alert(1)' }),
        valid({ id: 'half', latest: { version: '1.0.0', downloadUrl: 'https://x.example/a.zip' } }),
        valid({ id: 'short-sha', latest: { version: '1.0.0', downloadUrl: 'https://x.example/a.zip', sha256: 'abc' } }),
        valid({ id: 'homepage-only', latest: undefined, pricing: 'paid', homepage: 'https://x.example' }),
        'not an object',
      ],
    });
    expect(plugins.map((p) => p.id)).toEqual(['hello-world', 'homepage-only']);
    expect(skipped.map((s) => [s.index, s.id])).toEqual([
      [1, 'hello-world'], [2, 'Bad Id'], [3, 'no-range'], [4, 'js-link'], [5, 'half'], [6, 'short-sha'], [8, null],
    ]);
    expect(skipped[0].reason).toBe('duplicate id');
    expect(skipped[3].reason).toMatch(/homepage/);
  });
});

describe('registryCompatibility', () => {
  it('uses the same semver rule as installed plugins', () => {
    expect(registryCompatibility({ nodepress: '^1.6.0' }, '1.7.2')).toBeNull();
    expect(registryCompatibility({ nodepress: '^2.0.0' }, '1.7.2')).toMatch(/Requires NodePress \^2\.0\.0/);
    expect(registryCompatibility({ nodepress: '>=1.6.0' }, '1.8.0-beta.1')).toBeNull();
  });
});

describe('isBlockedAddress', () => {
  it.each([
    '127.0.0.1', '10.1.2.3', '172.20.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1',
    '::1', '::', 'fe80::1', 'fd00::1', '::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:a9fe:a9fe', '64:ff9b::a00:1', 'not-an-ip',
  ])('blocks %s', (ip) => expect(isBlockedAddress(ip)).toBe(true));

  it.each(['1.1.1.1', '140.82.112.3', '2606:4700::1111', '::ffff:8.8.8.8'])('allows %s', (ip) => {
    expect(isBlockedAddress(ip)).toBe(false);
  });
});

describe('guardedGet', () => {
  let server: http.Server;
  let base: string;
  beforeAll(async () => {
    server = http.createServer((req, res) => {
      if (req.url === '/big') { res.end(Buffer.alloc(2048)); return; }
      if (req.url === '/redirect') { res.writeHead(302, { location: '/ok' }); res.end(); return; }
      if (req.url === '/slow') return; // never answers
      if (req.url === '/ok') { res.end('hello'); return; }
      res.writeHead(404); res.end();
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise((r) => server.close(r)));

  const open = { timeoutMs: 2000, maxBytes: 1024, allowHttp: true, allowPrivate: true };

  it('downloads, following redirects', async () => {
    expect((await guardedGet(`${base}/redirect`, open)).body.toString()).toBe('hello');
  });

  it('refuses http and private addresses unless allowed', async () => {
    await expect(guardedGet(`${base}/ok`, { ...open, allowHttp: false })).rejects.toThrow(/Only https/);
    await expect(guardedGet(`${base}/ok`, { ...open, allowPrivate: false })).rejects.toThrow(/private or reserved/);
    const port = (server.address() as AddressInfo).port;
    await expect(guardedGet(`http://localhost:${port}/ok`, { ...open, allowPrivate: false })).rejects.toThrow(/private or reserved/);
  });

  it('enforces the size limit, the deadline and the status', async () => {
    await expect(guardedGet(`${base}/big`, open)).rejects.toThrow(/larger than/);
    await expect(guardedGet(`${base}/slow`, { ...open, timeoutMs: 200 })).rejects.toThrow(/Timed out/);
    await expect(guardedGet(`${base}/missing`, open)).rejects.toThrow(/HTTP 404/);
    await expect(guardedGet('file:///etc/passwd', open)).rejects.toThrow(/Only https/);
  });
});
